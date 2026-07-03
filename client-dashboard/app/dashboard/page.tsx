import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getUmamiStats, getUmamiPageviews } from '@/utils/umami'
import { getKumaMonitors } from '@/utils/kuma'
import DashboardTabs from './DashboardTabs'

interface Props {
  searchParams: Promise<{ client_id?: string }>
}

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()
  const { client_id: clientId } = await searchParams

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Redirect handled by middleware
    return null
  }

  // Check if admin is viewing another client's dashboard
  let isViewingAsAdmin = false
  let effectiveUserId = user.id

  if (clientId && clientId !== user.id) {
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (adminProfile?.role === 'admin') {
      isViewingAsAdmin = true
      effectiveUserId = clientId
    }
  }

  let profile = null
  let tickets: any[] = []
  let invoices: any[] = []

  // Use admin client when viewing as admin to bypass RLS
  const queryClient = isViewingAsAdmin ? supabaseAdmin : supabase

  try {
    const { data: profileData } = await queryClient
      .from('profiles')
      .select('*')
      .eq('id', effectiveUserId)
      .maybeSingle()
    profile = profileData
  } catch {
    // Table may not exist yet
  }

  try {
    const { data: ticketData } = await queryClient
      .from('tickets')
      .select('*, ticket_messages(*)')
      .eq('client_id', effectiveUserId)
      .order('created_at', { ascending: false })
    tickets = ticketData ?? []
  } catch {
    // Table may not exist yet
  }

  try {
    const { data: invoiceData } = await queryClient
      .from('invoices')
      .select('*')
      .eq('client_id', effectiveUserId)
      .order('invoice_date', { ascending: false })
    invoices = invoiceData ?? []
  } catch {
    // Table may not exist yet
  }

  // Fetch Umami analytics stats (30-day) — uses client's website ID if set, otherwise global default
  const umamiStats = await getUmamiStats(profile?.umami_website_id)

  // Fetch Umami pageview time-series for chart
  const umamiPageviews = await getUmamiPageviews(profile?.umami_website_id)

  // Fetch Uptime Kuma monitors — uses client's status slug if set, otherwise global default
  const kumaMonitors = await getKumaMonitors(profile?.kuma_status_slug)

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <DashboardTabs
          profile={profile}
          initialTickets={tickets}
          umamiStats={umamiStats}
          umamiPageviews={umamiPageviews}
          kumaMonitors={kumaMonitors}
          initialInvoices={invoices}
          isViewingAsAdmin={isViewingAsAdmin}
        />
      </div>
    </div>
  )
}