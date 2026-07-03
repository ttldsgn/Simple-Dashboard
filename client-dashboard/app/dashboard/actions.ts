'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { notifyAdminNewTicket, notifyClientTicketUpdate } from '@/utils/email'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

function createSafeUploadPath(userId: string, file: File) {
  const extension = (file.name.split('.').pop() || 'png').toLowerCase()
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']
  const safeExtension = allowedExtensions.includes(extension) ? extension : 'png'
  return `${userId}/${Date.now()}.${safeExtension}`
}

export async function createTicket(formData: FormData) {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const file = formData.get('attachment') as File | null

  if (!title || !description) throw new Error('Title and description are required')

  let imageUrl: string | null = null

  // Handle screenshot upload
  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error('Attachment must be less than 2MB')
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are allowed')
    }

    const fileName = createSafeUploadPath(user.id, file)

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('ticket-attachments')
      .upload(fileName, file, { contentType: file.type, upsert: false })

    if (uploadErr) {
      console.error('Upload error:', uploadErr)
      throw new Error('Failed to upload attachment')
    }

    const { data: urlData } = await supabaseAdmin.storage
      .from('ticket-attachments')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7) // 7-day expiry

    imageUrl = urlData?.signedUrl || null
  }

  // Create ticket
  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .insert({
      client_id: user.id,
      title,
      description,
      status: 'open',
    })
    .select('id')
    .single()

  if (ticketErr || !ticket) throw new Error(ticketErr?.message || 'Failed to create ticket')

  // Create first message
  const { error: msgErr } = await supabase
    .from('ticket_messages')
    .insert({
      ticket_id: ticket.id,
      sender_type: 'client',
      message: description,
      image_url: imageUrl,
    })

  if (msgErr) throw new Error('Failed to create message')

  // Cleanup old closed tickets
  try { await supabaseAdmin.rpc('cleanup_closed_tickets', { retention_days: 30 }) } catch { /* optional */ }

  // Notify admin
  const userEmail = user.email || 'Unknown'
  notifyAdminNewTicket(title, userEmail).catch(() => {})

  revalidatePath('/dashboard')
  revalidatePath('/admin')
}

export async function replyToTicket(formData: FormData) {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const ticketId = formData.get('ticket_id') as string
  const message = formData.get('message') as string
  const file = formData.get('attachment') as File | null

  if (!ticketId || !message) throw new Error('Ticket ID and message are required')

  // Verify ownership
  const { data: ticket } = await supabase
    .from('tickets')
    .select('client_id, title, status')
    .eq('id', ticketId)
    .single()

  if (!ticket || ticket.client_id !== user.id) {
    throw new Error('Unauthorized')
  }

  let imageUrl: string | null = null

  if (file && file.size > 0) {
    if (file.size > MAX_FILE_SIZE) throw new Error('Attachment must be less than 2MB')
    if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed')

    const fileName = createSafeUploadPath(user.id, file)

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('ticket-attachments')
      .upload(fileName, file, { contentType: file.type, upsert: false })

    if (uploadErr) throw new Error('Failed to upload attachment')

    const { data: urlData } = await supabaseAdmin.storage
      .from('ticket-attachments')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7) // 7-day expiry

    imageUrl = urlData?.signedUrl || null
  }

  // Insert message
  await supabase
    .from('ticket_messages')
    .insert({
      ticket_id: ticketId,
      sender_type: 'client',
      message,
      image_url: imageUrl,
    })

  // Update ticket timestamp
  await supabaseAdmin
    .from('tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', ticketId)

  revalidatePath('/dashboard')
  revalidatePath('/admin')
}

export async function adminReplyToTicket(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Verify admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')

  const ticketId = formData.get('ticket_id') as string
  const message = formData.get('message') as string

  if (!ticketId || !message) throw new Error('Required fields missing')

  // Get ticket info for email notification
  const { data: ticket } = await supabaseAdmin
    .from('tickets')
    .select('title, client_id, status')
    .eq('id', ticketId)
    .single()

  // Insert admin message
  await supabaseAdmin
    .from('ticket_messages')
    .insert({
      ticket_id: ticketId,
      sender_type: 'admin',
      message,
    })

  // Update ticket timestamp
  await supabaseAdmin
    .from('tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', ticketId)

  // Notify client
  if (ticket) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ticket.client_id)
    if (userData?.user?.email) {
      notifyClientTicketUpdate(ticket.title, userData.user.email, ticket.status).catch(() => {})
    }
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

// ============================================================================
// Invoice actions (admin only)
// ============================================================================

export async function addInvoice(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')

  const clientId = formData.get('client_id') as string
  const invoiceDate = formData.get('invoice_date') as string
  const description = formData.get('description') as string
  const amount = formData.get('amount') as string
  const status = formData.get('status') as string
  const zohoLink = formData.get('zoho_link') as string

  if (!clientId || !description || !zohoLink) throw new Error('Required fields missing')
  if (status !== 'paid' && status !== 'open') throw new Error('Invalid status')

  const { error } = await supabaseAdmin
    .from('invoices')
    .insert({
      client_id: clientId,
      invoice_date: invoiceDate || new Date().toISOString().split('T')[0],
      description,
      amount,
      status,
      zoho_link: zohoLink,
    })

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function updateInvoiceStatus(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')

  const invoiceId = formData.get('invoice_id') as string
  const status = formData.get('status') as string

  if (!invoiceId || (status !== 'paid' && status !== 'open')) throw new Error('Invalid request')

  const { error } = await supabaseAdmin
    .from('invoices')
    .update({ status })
    .eq('id', invoiceId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function updateInvoice(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')

  const invoiceId = formData.get('invoice_id') as string
  const invoiceDate = formData.get('invoice_date') as string
  const description = formData.get('description') as string
  const amount = formData.get('amount') as string
  const status = formData.get('status') as string
  const zohoLink = formData.get('zoho_link') as string

  if (!invoiceId || !description || !zohoLink) throw new Error('Required fields missing')
  if (status !== 'paid' && status !== 'open') throw new Error('Invalid status')

  const { error } = await supabaseAdmin
    .from('invoices')
    .update({
      invoice_date: invoiceDate || undefined,
      description,
      amount,
      status,
      zoho_link: zohoLink,
    })
    .eq('id', invoiceId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function deleteInvoice(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')

  const invoiceId = formData.get('invoice_id') as string
  if (!invoiceId) throw new Error('Invoice ID required')

  const { error } = await supabaseAdmin
    .from('invoices')
    .delete()
    .eq('id', invoiceId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function deleteTickets(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')

  const ticketIdsStr = formData.get('ticket_ids') as string
  if (!ticketIdsStr) throw new Error('No ticket IDs provided')

  const ticketIds = ticketIdsStr.split(',').map(id => id.trim()).filter(Boolean)
  if (ticketIds.length === 0) throw new Error('No ticket IDs provided')

  const { error } = await supabaseAdmin
    .from('tickets')
    .delete()
    .in('id', ticketIds)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}

export async function adminUpdateTicketStatus(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')

  const ticketId = formData.get('ticket_id') as string
  const status = formData.get('status') as string

  if (!ticketId || !status) throw new Error('Required fields missing')

  const validStatuses = ['open', 'in_progress', 'resolved', 'closed']
  if (!validStatuses.includes(status)) throw new Error('Invalid status')

  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'closed') {
    updateData.closed_at = new Date().toISOString()
  }

  const { error } = await supabaseAdmin
    .from('tickets')
    .update(updateData)
    .eq('id', ticketId)

  if (error) throw new Error(error.message)

  // Notify client
  const { data: ticket } = await supabaseAdmin
    .from('tickets')
    .select('title, client_id')
    .eq('id', ticketId)
    .single()

  if (ticket) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(ticket.client_id)
    if (userData?.user?.email) {
      notifyClientTicketUpdate(ticket.title, userData.user.email, status).catch(() => {})
    }
  }

  revalidatePath('/admin')
  revalidatePath('/dashboard')
}