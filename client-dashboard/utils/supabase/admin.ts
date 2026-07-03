import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Supabase admin client using the service_role key.
 * This bypasses RLS and should ONLY be used in server-side code
 * (server actions, API routes, or scripts).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 */
export function createAdminClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}