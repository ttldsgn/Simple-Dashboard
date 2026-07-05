'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function verifyMfa(formData: FormData) {
  const supabase = await createClient()
  const code = formData.get('code') as string
  const factorId = formData.get('factorId') as string

  if (!code || !factorId) {
    redirect('/auth/mfa/verify?error=' + encodeURIComponent('Missing code or factor ID.'))
  }

  const { data: challengeData, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId })

  if (challengeError) {
    redirect('/auth/mfa/verify?error=' + encodeURIComponent(challengeError.message))
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challengeData.id,
    code,
  })

  if (verifyError) {
    redirect('/auth/mfa/verify?error=' + encodeURIComponent(verifyError.message))
  }

  // Check user role to redirect correctly
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.role === 'admin') {
      revalidatePath('/', 'layout')
      redirect('/admin')
    }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
