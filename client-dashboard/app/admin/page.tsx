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

  // Fetch all clients with their profiles — only select columns that definitely exist
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let profileClients: any[] = []
  try {
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('id, role, updated_at, created_at')
      .eq('role', 'client')
      .order('updated_at', { ascending: false })
    profileClients = data ?? []
  } catch {
    // Columns may vary after migration — try minimal select
    try {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('role', 'client')
      profileClients = data ?? []
    } catch {
      // Fallback: empty list, clients will be discovered from project_members
    }
  }

  // Fetch projects and members (may not exist before migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let projects: any[] = []
  let userProjectMap: Record<string, string> = {}
  try {
    const { data: projectData } = await supabaseAdmin
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })
    projects = projectData ?? []

    const { data: memberData } = await supabaseAdmin
      .from('project_members')
      .select('*')
    for (const pm of memberData ?? []) {
      userProjectMap[pm.user_id] = pm.project_id
    }
  } catch {
    // Projects/members tables may not exist yet
  }

  // Build maps: user ID → email, user ID → company name
  const emailMap: Record<string, string> = {}
  const companyNameMap: Record<string, string> = {}

  // First, get company names from profiles
  const profileMap: Record<string, Record<string, unknown>> = {}
  for (const c of profileClients ?? []) {
    profileMap[c.id] = c
    companyNameMap[c.id] = c.company_name || ''
  }

  // Fill in company names from projects for users in project_members
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projectMap: Record<string, any> = {}
  for (const p of projects) {
    projectMap[p.id] = p
  }
  for (const [userId, projId] of Object.entries(userProjectMap)) {
    if (!companyNameMap[userId] && projectMap[projId]?.company_name) {
      companyNameMap[userId] = projectMap[projId].company_name
    }
  }

  // Discover all clients: merge profileClients with users found in project_members
  const seenUserIds = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clients: any[] = []

  // Add clients that have profiles — enrich with project data for display/edit forms
  for (const c of profileClients ?? []) {
    if (c.role === 'client') {
      seenUserIds.add(c.id)
      const projectId = userProjectMap[c.id]
      const project = projectId ? projectMap[projectId] : null
      clients.push({
        ...c,
        company_name: c.company_name || project?.company_name || null,
        umami_website_id: c.umami_website_id ?? project?.umami_website_id ?? null,
        kuma_status_slug: c.kuma_status_slug ?? project?.kuma_status_slug ?? null,
        kuma_badges: c.kuma_badges ?? project?.kuma_badges ?? null,
        domain_expiry_domain: c.domain_expiry_domain ?? project?.domain_expiry_domain ?? null,
      })
    }
  }

  // Add clients discovered from project_members that don't have profiles
  for (const userId of Object.keys(userProjectMap)) {
    if (!seenUserIds.has(userId)) {
      seenUserIds.add(userId)
      const project = projectMap[userProjectMap[userId]]
      clients.push({
        id: userId,
        role: 'client',
        company_name: project?.company_name || null,
        umami_website_id: project?.umami_website_id ?? null,
        kuma_status_slug: project?.kuma_status_slug ?? null,
        kuma_badges: project?.kuma_badges ?? null,
        domain_expiry_domain: project?.domain_expiry_domain ?? null,
        created_at: null,
        updated_at: null,
      })
    }
  }

  // Get emails from auth
  try {
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
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
          clients={clients}
          projects={projects}
          emailMap={emailMap}
          companyNameMap={companyNameMap}
          userProjectMap={userProjectMap}
          projectMap={projectMap}
          tickets={tickets ?? []}
          allInvoices={allInvoices ?? []}
        />
      </div>
    </div>
  )
}