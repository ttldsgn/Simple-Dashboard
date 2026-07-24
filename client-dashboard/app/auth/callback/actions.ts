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
 * Supports two modes:
 * 1. Add to existing project: provide `project_id`
 * 2. Create new project: provide `company_name` (and optional settings)
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
  const existingProjectId = formData.get('project_id') as string
  const companyName = formData.get('company_name') as string
  const umamiWebsiteId = formData.get('umami_website_id') as string
  const kumaStatusSlug = formData.get('kuma_status_slug') as string
  const domainExpiryDomain = formData.get('domain_expiry_domain') as string
  const kumaBadgesJson = formData.get('kuma_badges') as string

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
    return { error: 'Failed to invite user' }
  }

  // Create the profiles row for the new user (role only)
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: inviteData.user.id,
      company_name: companyName || null,
      umami_website_id: umamiWebsiteId || null,
      kuma_status_slug: kumaStatusSlug || null,
      kuma_badges: kumaBadges,
      domain_expiry_domain: domainExpiryDomain || null,
      role: 'client',
      updated_at: new Date().toISOString(),
    })

  if (profileError) {
    return { error: `User invited but profile creation failed: ${profileError.message}` }
  }

  // Determine which project to add the user to
  let targetProjectId: string | null = null

  if (existingProjectId) {
    // Mode 1: Add to existing project
    try {
      const { data: existingProject } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('id', existingProjectId)
        .maybeSingle()

      if (!existingProject) {
        return { error: 'Selected project not found' }
      }
      targetProjectId = existingProjectId
    } catch {
      return { error: 'Projects table not available yet — run the migration first' }
    }
  } else if (companyName) {
    // Mode 2: Create a new project
    try {
      const { data: newProject, error: projectErr } = await supabaseAdmin
        .from('projects')
        .insert({
          company_name: companyName,
          umami_website_id: umamiWebsiteId || null,
          kuma_status_slug: kumaStatusSlug || null,
          kuma_badges: kumaBadges.length > 0 ? kumaBadges : null,
          domain_expiry_domain: domainExpiryDomain || null,
        })
        .select('id')
        .single()

      if (projectErr || !newProject) {
        return { error: `Failed to create project: ${projectErr?.message || 'Unknown error'}` }
      }
      targetProjectId = newProject.id
    } catch {
      return { error: 'Projects table not available yet — run the migration first' }
    }
  }

  // If we have a target project, add the user as a member
  if (targetProjectId) {
    try {
      const { error: memberError } = await supabaseAdmin
        .from('project_members')
        .insert({
          project_id: targetProjectId,
          user_id: inviteData.user.id,
          role: 'member',
        })

      if (memberError) {
        // Non-fatal: user is still invited with profile
        console.error('Failed to add project membership:', memberError.message)
      }
    } catch {
      // Project members table may not exist yet — non-fatal
    }
  }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Admin-only: update an existing client's settings.
 * Also updates the projects table if it exists.
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

  // Update the profiles table (backward compatible)
  const { error } = await supabaseAdmin
    .from('profiles')
    .update(updateData)
    .eq('id', clientId)

  if (error) {
    return { error: error.message }
  }

  // Also update the projects table if a project_id was provided
  if (projectId) {
    try {
      await supabaseAdmin
        .from('projects')
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq('id', projectId)
    } catch {
      // Projects table may not exist yet — non-fatal
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
 * Admin-only: delete a client user and their profile.
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

  // Delete profile first
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
 * Admin-only: purge profiles that have no matching auth user (orphans).
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

  // Get all auth users — request a high page size to avoid pagination truncation
  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const validIds = new Set((authUsers?.users ?? []).map((u) => u.id))

  // Find orphans
  const orphanIds = allClients.filter((c) => !validIds.has(c.id)).map((c) => c.id)

  if (orphanIds.length === 0) {
    return { success: true, count: 0 }
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