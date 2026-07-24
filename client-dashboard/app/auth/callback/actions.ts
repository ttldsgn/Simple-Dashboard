'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return redirect('/?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/', 'layout')

  // Check if user has MFA enrolled
  const { data: factorsData, error: mfaError } = await supabase.auth.mfa.listFactors()
  if (mfaError) {
    return redirect('/?error=' + encodeURIComponent(mfaError.message))
  }
  if (factorsData?.totp && factorsData.totp.length > 0) {
    return redirect('/auth/mfa/verify')
  }

  // Check if user is admin — redirect to admin panel
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role === 'admin') {
      return redirect('/admin')
    }
  }

  redirect('/dashboard')
}

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/update-password`,
  })

  if (error) {
    return redirect('/?error=' + encodeURIComponent(error.message))
  }

  revalidatePath('/', 'layout')
  redirect('/?message=Check your email for a password reset link.')
}

/**
 * Admin-only: invite a new client user by email.
 * Creates the auth user (via invite), a profiles row (role only),
 * a projects row with settings, and a project_members row.
 */
export async function inviteUser(formData: FormData) {
  const supabaseAdmin = createAdminClient()

  // Verify caller is an admin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { error: 'Unauthorized — admin only' }
  }

  const email = formData.get('email') as string
  const companyName = formData.get('company_name') as string
  const umamiWebsiteId = formData.get('umami_website_id') as string
  const kumaStatusSlug = formData.get('kuma_status_slug') as string
  const domainExpiryDomain = formData.get('domain_expiry_domain') as string
  const kumaBadgesJson = formData.get('kuma_badges') as string
  const existingProjectId = formData.get('project_id') as string

  if (!email) {
    return { error: 'Email is required' }
  }

  // Parse badges JSON if provided
  let kumaBadges: unknown[] = []
  if (kumaBadgesJson) {
    try {
      kumaBadges = JSON.parse(kumaBadgesJson)
    } catch {
      // Ignore invalid JSON
    }
  }

  // Invite the user via Supabase Admin API (sends invite email)
  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/update-password`,
    })

  if (inviteError) {
    return { error: inviteError.message }
  }

  if (!inviteData.user) {
    return { error: 'Failed to create user' }
  }

  const newUserId = inviteData.user.id

  // 1. Create the profiles row (auth-level fields only: role)
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: newUserId,
      role: 'client',
      updated_at: new Date().toISOString(),
    })

  if (profileError) {
    return { error: `Profile creation failed: ${profileError.message}` }
  }

  // 2. Handle project membership
  let projectId = existingProjectId || null

  if (!existingProjectId) {
    // Create a new project for this client
    const { data: newProject, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert({
        company_name: companyName || null,
        umami_website_id: umamiWebsiteId || null,
        kuma_status_slug: kumaStatusSlug || null,
        kuma_badges: kumaBadges.length > 0 ? kumaBadges : null,
        domain_expiry_domain: domainExpiryDomain || null,
      })
      .select('id')
      .single()

    if (projectError) {
      return { error: `Project creation failed: ${projectError.message}` }
    }
    projectId = newProject.id
  }

  // 3. Add user to the project
  if (projectId) {
    try {
      await supabaseAdmin.from('project_members').insert({
        project_id: projectId,
        user_id: newUserId,
        role: existingProjectId ? 'member' : 'owner',
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // If project_members table doesn't exist, this is non-fatal
      if (!msg.includes('does not exist')) {
        return { error: `Project membership creation failed: ${msg}` }
      }
    }
  }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Admin-only: update an existing client's project settings.
 * Writes to the projects table, not profiles.
 */
export async function updateClient(formData: FormData) {
  const supabaseAdmin = createAdminClient()

  // Verify caller is an admin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { error: 'Unauthorized — admin only' }
  }

  const clientId = formData.get('client_id') as string
  const projectId = formData.get('project_id') as string
  const companyName = formData.get('company_name') as string
  const umamiWebsiteId = formData.get('umami_website_id') as string
  const kumaStatusSlug = formData.get('kuma_status_slug') as string
  const domainExpiryDomain = formData.get('domain_expiry_domain') as string
  const kumaBadgesJson = formData.get('kuma_badges') as string

  if (!clientId) {
    return { error: 'Client ID is required' }
  }

  // Parse badges JSON if provided
  let kumaBadges: unknown[] | undefined
  if (kumaBadgesJson) {
    try {
      kumaBadges = JSON.parse(kumaBadgesJson)
    } catch {
      // Ignore invalid JSON
    }
  }

  const updateData: Record<string, unknown> = {
    company_name: companyName || null,
    umami_website_id: umamiWebsiteId || null,
    kuma_status_slug: kumaStatusSlug || null,
    domain_expiry_domain: domainExpiryDomain || null,
    updated_at: new Date().toISOString(),
  }

  if (kumaBadges !== undefined) {
    updateData.kuma_badges = kumaBadges
  }

  // If we have a project_id from the form, update that project directly
  if (projectId) {
    const { error } = await supabaseAdmin
      .from('projects')
      .update(updateData)
      .eq('id', projectId)

    if (error) {
      return { error: error.message }
    }
  } else {
    // Fallback: find the user's project via project_members and update it
    const { data: memberRow } = await supabaseAdmin
      .from('project_members')
      .select('project_id')
      .eq('user_id', clientId)
      .maybeSingle()

    if (!memberRow?.project_id) {
      return { error: 'No project found for this client.' }
    }

    const { error } = await supabaseAdmin
      .from('projects')
      .update(updateData)
      .eq('id', memberRow.project_id)

    if (error) {
      return { error: error.message }
    }
  }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Admin-only: resend invitation to an existing client.
 */
export async function resendInvite(formData: FormData) {
  const supabaseAdmin = createAdminClient()

  // Verify caller is an admin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { error: 'Unauthorized — admin only' }
  }

  const clientId = formData.get('client_id') as string

  if (!clientId) {
    return { error: 'Client ID is required' }
  }

  // Get the client's email from auth
  const { data: userData, error: userErr } =
    await supabaseAdmin.auth.admin.getUserById(clientId)

  if (userErr || !userData?.user?.email) {
    return { error: 'Could not find user email' }
  }

  // Re-send the invite
  const { error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(userData.user.email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/update-password`,
    })

  if (inviteError) {
    return { error: inviteError.message }
  }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Admin-only: delete a client user, their profile, and project memberships.
 */
export async function deleteClient(formData: FormData) {
  const supabaseAdmin = createAdminClient()

  // Verify caller is an admin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { error: 'Unauthorized — admin only' }
  }

  const clientId = formData.get('client_id') as string

  if (!clientId) {
    return { error: 'Client ID is required' }
  }

  // Delete project_members rows for this user
  try {
    await supabaseAdmin
      .from('project_members')
      .delete()
      .eq('user_id', clientId)
  } catch {
    // Table may not exist
  }

  // Delete profile
  const { error: profileErr } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', clientId)

  if (profileErr) {
    return { error: profileErr.message }
  }

  // Delete auth user — if already deleted manually, that's fine
  try {
    await supabaseAdmin.auth.admin.deleteUser(clientId)
  } catch {
    // Auth user may already be deleted — profile is already cleaned up, so succeed
  }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Admin-only: purge profiles that have no matching auth user (orphans),
 * and their project memberships.
 */
export async function purgeOrphans() {
  const supabaseAdmin = createAdminClient()

  // Verify caller is an admin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { error: 'Unauthorized — admin only' }
  }

  // Get all client profile IDs
  const { data: allClients } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('role', 'client')

  if (!allClients) {
    return { success: true, count: 0 }
  }

  // Get all auth users
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
  const validIds = new Set((authUsers?.users ?? []).map((u) => u.id))

  // Find orphans
  const orphanIds = allClients.filter((c) => !validIds.has(c.id)).map((c) => c.id)

  if (orphanIds.length === 0) {
    return { success: true, count: 0 }
  }

  // Delete orphans' project memberships first
  try {
    await supabaseAdmin
      .from('project_members')
      .delete()
      .in('user_id', orphanIds)
  } catch {
    // Table may not exist
  }

  // Delete orphans
  const { error } = await supabaseAdmin
    .from('profiles')
    .delete()
    .in('id', orphanIds)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin')
  return { success: true, count: orphanIds.length }
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}