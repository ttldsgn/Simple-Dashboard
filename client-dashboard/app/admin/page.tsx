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

  // Build maps from clients: user ID → email, user ID → company name
  const emailMap: Record<string, string> = {}
  const companyNameMap: Record<string, string> = {}
  for (const c of clients ?? []) {
    companyNameMap[c.id] = c.company_name || ''
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

  // Fetch projects for invite dropdown
  const projects: { id: string; company_name: string | null }[] = []
  try {
    const { data: projectData } = await supabaseAdmin
      .from('projects')
      .select('id, company_name')
      .order('updated_at', { ascending: false })
    if (projectData) projects.push(...projectData)
  } catch { /* ok */ }

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
          emailMap={emailMap}
          companyNameMap={companyNameMap}
          tickets={tickets ?? []}
          allInvoices={allInvoices ?? []}
          projects={projects}
        />
      </div>
    </div>
  )
}