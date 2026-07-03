import { createClient as createServiceClient } from '@supabase/supabase-js'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

/**
 * Supabase admin client using the service_role key.
 * This bypasses RLS and should ONLY be used in server-side code
 * (server actions, API routes, or scripts).
 */
export function createAdminClient() {
  return createServiceClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}