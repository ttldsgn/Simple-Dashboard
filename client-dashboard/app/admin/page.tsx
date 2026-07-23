import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { redirect } from 'next/navigation'
import AdminTabs from './AdminTabs'
import { signout } from '@/app/auth/callback/actions'

export default async function AdminPage() {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect('/')
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return redirect('/dashboard')
  }

  // Fetch all clients with their profiles — use admin client to bypass RLS
  const { data: clients } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('role', 'client')
    .order('updated_at', { ascending: false })

  // Fetch all projects
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false })

  // Fetch all project members (user_id → project_id mapping)
  const { data: projectMembers } = await supabaseAdmin
    .from('project_members')
    .select('*')

  // Build maps: user_id → email, user_id → project_id
  const emailMap: Record<string, string> = {}
  const userProjectMap: Record<string, string> = {}
  for (const pm of projectMembers ?? []) {
    userProjectMap[pm.user_id] = pm.project_id
  }
  try {
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        if (u.email) {
          emailMap[u.id] = u.email
        }
      }
    }
  } catch {
    // Admin client not configured
  }

  // Build project ID → project lookup
  const projectMap: Record<string, { company_name: string | null; id: string }> = {}
  for (const p of projects ?? []) {
    projectMap[p.id] = p
  }

  // Fetch all tickets with messages
  const { data: tickets } = await supabaseAdmin
    .from('tickets')
    .select('*, ticket_messages(*)')
    .order('updated_at', { ascending: false })

  // Fetch all invoices
  const { data: allInvoices } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .order('invoice_date', { ascending: false })

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
            <p className="text-sm text-slate-500 mt-1">Manage client accounts and settings</p>
          </div>
          <div className="flex items-center gap-4">
            <form action={signout}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Sign Out
              </button>
            </form>
          </div>
        </div>

        <AdminTabs
          clients={clients ?? []}
          projects={projects ?? []}
          emailMap={emailMap}
          userProjectMap={userProjectMap}
          projectMap={projectMap}
          tickets={tickets ?? []}
          allInvoices={allInvoices ?? []}
        />
      </div>
    </div>
  )
}
