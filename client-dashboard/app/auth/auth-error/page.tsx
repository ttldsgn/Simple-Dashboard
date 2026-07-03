import Link from 'next/link'

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-red-600">Authentication Error</h1>
        <p className="text-sm text-slate-600">
          The login link may have expired or is invalid. Please try logging in again.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          Back to Login
        </Link>
      </div>
    </div>
  )
}