'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { unenrollMfa } from '@/app/auth/mfa/setup/actions'
import Link from 'next/link'

export default function MfaCard() {
  const [status, setStatus] = useState<'loading' | 'enabled' | 'disabled' | 'error'>('loading')
  const [factorId, setFactorId] = useState('')
  const [error, setError] = useState('')
  const [disabling, setDisabling] = useState(false)

  useEffect(() => {
    async function checkStatus() {
      const supabase = createClient()
      const { data, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) {
        setStatus('error')
        setError(listError.message)
        return
      }
      if (data?.totp && data.totp.length > 0) {
        setStatus('enabled')
        setFactorId(data.totp[0].id)
      } else {
        setStatus('disabled')
      }
    }
    checkStatus()
  }, [])

  async function handleDisable() {
    if (!confirm('Are you sure you want to disable two-factor authentication?')) return
    setDisabling(true)
    const formData = new FormData()
    formData.set('factorId', factorId)
    await unenrollMfa(formData)
  }

  if (status === 'loading') {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-24 rounded bg-slate-200" />
          <div className="h-8 w-32 rounded bg-slate-200" />
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-red-700 mb-2">Two-Factor Authentication</h3>
        <p className="text-xs text-red-600">{error || 'Unable to check MFA status.'}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Two-Factor Authentication</h3>

      {status === 'enabled' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-emerald-700">Enabled</span>
          </div>
          <p className="text-xs text-slate-500">
            Your account is protected with an authenticator app. You will be asked for a verification code each time you sign in.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); handleDisable() }}>
            <button
              type="submit"
              disabled={disabling}
              className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {disabling ? 'Disabling...' : 'Disable 2FA'}
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="text-sm font-medium text-slate-500">Not Enabled</span>
          </div>
          <p className="text-xs text-slate-500">
            Add an extra layer of security to your account by enabling two-factor authentication.
          </p>
          <Link
            href="/auth/mfa/setup"
            className="inline-block rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            Setup 2FA
          </Link>
        </div>
      )}
    </div>
  )
}