'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { setFlash } from '@/utils/flash'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export async function enrollMfa() {
  const supabase = await createClient()

  // First, try to clean up any existing factors via admin API
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  try {
    const adminClient = createAdminClient()

    // Use GoTrue admin API to delete factors for this user
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

    // Get current user ID for admin operations
    const userId = user.id

    const listRes = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${userId}/factors`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    )

    if (listRes.ok) {
      const factors: Array<{ id: string; factor_type: string; status: string }> = await listRes.json()
      for (const factor of factors) {
        if (factor.factor_type === 'totp') {
          await fetch(
            `${supabaseUrl}/auth/v1/admin/users/${userId}/factors/${factor.id}`,
            {
              method: 'DELETE',
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
              },
            }
          )
        }
      }
    }
  } catch {
    // Admin cleanup failed — fall through to regular enroll
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Client Dashboard',
  })

  if (error) {
    return { error: error.message }
  }

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  }
}

export async function verifyMfaSetup(formData: FormData) {
  const supabase = await createClient()
  const factorId = formData.get('factorId') as string
  const code = formData.get('code') as string

  if (!factorId || !code) {
    await setFlash('error', 'Missing information.')
    redirect('/dashboard')
  }

  const { data: challengeData, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId })

  if (challengeError) {
    await setFlash('error', challengeError.message)
    redirect('/dashboard')
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  })

  if (verifyError) {
    await setFlash('error', verifyError.message)
    redirect('/dashboard')
  }

  revalidatePath('/', 'layout')
  await setFlash('success', 'Two-factor authentication has been enabled.')
  redirect('/dashboard')
}

export async function unenrollMfa(formData: FormData) {
  const supabase = await createClient()
  const factorId = formData.get('factorId') as string

  if (!factorId) {
    await setFlash('error', 'No MFA device found.')
    redirect('/dashboard')
  }

  // Try user-level unenroll first
  const { error: userError } = await supabase.auth.mfa.unenroll({ factorId })

  if (!userError) {
    revalidatePath('/', 'layout')
    await setFlash('success', 'Two-factor authentication has been disabled.')
    redirect('/dashboard')
  }

  // If user-level unenroll fails, try admin API
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
      const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
      const deleteRes = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${user.id}/factors/${factorId}`,
        {
          method: 'DELETE',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      )
      if (deleteRes.ok) {
        revalidatePath('/', 'layout')
        await setFlash('success', 'Two-factor authentication has been disabled (via admin).')
        redirect('/dashboard')
      }
    }
  } catch {
    // fall through to error
  }

  await setFlash('error', userError.message)
  redirect('/dashboard')
}