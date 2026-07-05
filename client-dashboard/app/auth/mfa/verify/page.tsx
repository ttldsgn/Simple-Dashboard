import { createClient } from '@/utils/supabase/server'
import { verifyMfa } from './actions'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ error?: string }>
}

export default async function MfaVerifyPage({ searchParams }: Props) {
  const { error } = await searchParams
  const supabase = await createClient()
  const { data: factorsData } = await supabase.auth.mfa.listFactors()
  const totpFactor = factorsData?.totp?.[0]

  // If no TOTP factor found, redirect to login
  if (!totpFactor) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-xl font-bold text-slate-900">No MFA Device Found</h1>
          <p className="text-slate-600">No two-factor authentication device is configured for this account.</p>
          <Link
            href="/"
            className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Two-Factor Authentication</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <form className="space-y-4">
          <input type="hidden" name="factorId" value={totpFactor.id} />
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-slate-700">
              Verification Code
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

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            formAction={verifyMfa}
            className="flex w-full justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Verify
          </button>

          <p className="text-center text-sm text-slate-500">
            <Link href="/" className="font-medium text-indigo-600 hover:text-indigo-500">
              Back to Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}