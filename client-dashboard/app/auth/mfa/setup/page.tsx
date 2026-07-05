'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { enrollMfa, verifyMfaSetup } from './actions'
import Link from 'next/link'

interface ExistingFactor {
  id: string
  status: string
}

export default function MfaSetupPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'verifying' | 'done' | 'error' | 'existing_stale' | 'existing_active'>('loading')
  const [factorId, setFactorId] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState('')
  const [existingFactors, setExistingFactors] = useState<ExistingFactor[]>([])
  const [returnUrl, setReturnUrl] = useState('/dashboard')

  useEffect(() => {
    async function detectRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        if (profile?.role === 'admin') {
          setReturnUrl('/admin')
        }
      }
    }
    detectRole()
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient()

        // Check for existing factors first
        const { data: factorsData } = await supabase.auth.mfa.listFactors()
        const totpFactors = factorsData?.totp ?? []

        if (totpFactors.length > 0) {
          const verified = totpFactors.some(f => (f as { status: string }).status === 'verified')
          setExistingFactors(totpFactors)
          if (verified) {
            setState('existing_active')
          } else {
            // Pending/unverified — try to recover by completing setup
            const pending = totpFactors.find(f => (f as { status: string }).status === 'unverified' || !(f as { status: string }).status)
            if (pending) {
              // Try to get enrollment details by re-enrolling (will fail with "already exists"
              // but first let's try unenrolling the pending one and re-enrolling)
              for (const factor of totpFactors) {
                await supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => {})
              }
              // Re-check after cleanup attempt
              const { data: refreshed } = await supabase.auth.mfa.listFactors()
              if (refreshed?.totp && refreshed.totp.length > 0) {
                setState('existing_stale')
                setExistingFactors(refreshed.totp)
              } else {
                // Cleanup succeeded, now enroll
                const result = await enrollMfa()
                if (result && 'factorId' in result) {
                  setFactorId(result.factorId ?? '')
                  setQrCode(result.qrCode ?? '')
                  setSecret(result.secret ?? '')
                  setState('ready')
                  return
                }
              }
            } else {
              setState('existing_stale')
            }
            return
          }
        }

        // No existing factors — enroll fresh
        const result = await enrollMfa()
        if (result && 'factorId' in result) {
          setFactorId(result.factorId ?? '')
          setQrCode(result.qrCode ?? '')
          setSecret(result.secret ?? '')
          setState('ready')
        } else if (result && 'error' in result) {
          setState('error')
          setError(result.error)
        } else {
          setState('error')
          setError('Server returned an empty response.')
        }
      } catch (err) {
        setState('error')
        setError(err instanceof Error ? err.message : 'Network error. Please try again.')
      }
    }
    init()
  }, [])

  async function handleVerify(formData: FormData) {
    setState('verifying')
    formData.append('factorId', factorId)
    await verifyMfaSetup(formData)
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
        <div className="text-slate-600 animate-pulse">Setting up...</div>
      </div>
    )
  }

  if (state === 'existing_stale') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-lg space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-center">
            <h1 className="text-xl font-bold text-amber-900">Stale MFA Factor Detected</h1>
            <p className="mt-2 text-sm text-slate-600">
              A previous MFA setup was started but not completed. Supabase does not allow deleting pending factors via API.
            </p>
          </div>

          <div className="rounded-md bg-amber-50 border border-amber-200 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-800">How to fix this:</p>
            <ol className="list-decimal list-inside text-sm text-amber-700 space-y-1">
              <li>Open your <strong>Supabase Dashboard</strong></li>
              <li>Go to <strong>Authentication → Users</strong></li>
              <li>Find your user (search by email)</li>
              <li>Click <strong>Manage</strong> → go to <strong>Multi-factor Authentication</strong></li>
              <li>Click the <strong>trash icon</strong> on any TOTP factor to remove it</li>
              <li>Return here and click "Setup 2FA" again</li>
            </ol>
          </div>

          {existingFactors.length > 0 && (
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-500 mb-2">Existing factors found:</p>
              {existingFactors.map((f) => (
                <div key={f.id} className="text-xs font-mono text-slate-600">
                  ID: {f.id} — Status: {f.status || 'unknown'}
                </div>
              ))}
            </div>
          )}

          <Link
            href={returnUrl}
            className="inline-block w-full rounded-md bg-indigo-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'existing_active') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold text-slate-900">MFA Already Enabled</h1>
          <p className="text-sm text-slate-600">
            Two-factor authentication is already set up for your account. You can disable it from the dashboard.
          </p>
          <Link
            href={returnUrl}
            className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold text-red-900">Enrollment Failed</h1>
          <p className="text-red-600">{error}</p>
          <Link
            href={returnUrl}
            className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Setup Two-Factor Authentication</h1>
          <p className="mt-2 text-sm text-slate-600">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)
          </p>
        </div>

        <div className="flex justify-center">
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrCode}
              alt="MFA QR Code"
              className="h-48 w-48"
            />
          </div>
        </div>

        <div className="rounded-md bg-slate-50 p-3 text-center">
          <p className="text-xs text-slate-500">Manual setup key:</p>
          <p className="mt-1 font-mono text-sm text-slate-800 break-all select-all">{secret}</p>
        </div>

        <form action={handleVerify} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-slate-700">
              Verify by entering a code from your app
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              placeholder="000000"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-center text-2xl tracking-widest text-slate-900 placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={state === 'verifying'}
            className="flex w-full justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {state === 'verifying' ? 'Verifying...' : 'Verify & Enable 2FA'}
          </button>

          <p className="text-center text-sm text-slate-500">
            <Link href={returnUrl} className="font-medium text-indigo-600 hover:text-indigo-500">
              Cancel
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}