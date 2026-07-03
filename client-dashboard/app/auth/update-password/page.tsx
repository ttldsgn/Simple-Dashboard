'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [sessionError, setSessionError] = useState('')

  // On mount, extract auth tokens from URL hash and establish the session client-side
  useEffect(() => {
    async function establishSession() {
      try {
        const supabase = createClient()

        // Parse auth tokens from the URL hash (Supabase puts them there in invite/reset links)
        const hash = window.location.hash.substring(1)
        const hashParams = new URLSearchParams(hash)
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          // Explicitly set the session from hash tokens — this is required because
          // @supabase/ssr's createBrowserClient doesn't auto-read URL hash fragments
          const { error: setSessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })

          if (setSessionErr) {
            setSessionError('This link has expired or is invalid. Please request a new invitation or password reset.')
            setCheckingSession(false)
            return
          }
        }

        // Verify the session is now established
        const { data, error: sessionErr } = await supabase.auth.getSession()

        if (sessionErr || !data.session) {
          setSessionError('This link has expired or is invalid. Please request a new invitation or password reset.')
          setCheckingSession(false)
          return
        }

      } catch {
        setSessionError('Failed to establish session. Please try again.')
      } finally {
        setCheckingSession(false)
      }
    }

    establishSession()
  }, [])

  async function handleSubmit(formData: FormData) {
    const password = formData.get('password') as string
    const confirm = formData.get('confirm_password') as string

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError(updateError.message)
        setSubmitting(false)
        return
      }

      // Password set successfully — check role and redirect accordingly
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        router.push(profile?.role === 'admin' ? '/admin' : '/dashboard')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // Loading state while checking session
  if (checkingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <p className="text-sm text-slate-500">Verifying your link...</p>
        </div>
      </div>
    )
  }

  // Session error — link expired or invalid
  if (sessionError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-red-600">Invalid Link</h1>
          <p className="text-sm text-slate-600">{sessionError}</p>
          <Link
            href="/"
            className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  // Session is ready — show the password form
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Set Your Password
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Choose a secure password for your account.
          </p>
        </div>

        <form action={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              New Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="confirm_password" className="block text-sm font-medium text-slate-700">
              Confirm Password
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {submitting ? 'Setting Password...' : 'Set Password'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500">
          <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}