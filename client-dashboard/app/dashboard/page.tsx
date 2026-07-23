import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getUmamiStats, getUmamiPageviews } from '@/utils/umami'
import { getKumaMonitors } from '@/utils/kuma'
import { getDomainExpiration } from '@/utils/whois'
import type { DomainExpiration } from '@/utils/whois'
import { getFlash, type FlashMessage } from '@/utils/flash'
import DashboardTabs from './DashboardTabs'

interface Props {
  searchParams: Promise<{ client_id?: string }>
}

interface DashboardProfile {
  id: string
  company_name: string | null
  uptime_url: string | null
  analytics_url: string | null
  umami_website_id?: string | null
  kuma_status_slug?: string | null
  kuma_badges?: Array<{ label: string; url: string }> | null
  domain_expiry_domain?: string | null
  updated_at?: string | null
}

interface DashboardTicket {
  id: string
  client_id: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  updated_at?: string
  closed_at?: string
  ticket_messages?: Array<{
    id: string
    ticket_id: string
    sender_type: 'client' | 'admin'
    message: string
    image_url?: string | null
    created_at: string
  }>
}

interface DashboardInvoice {
  id: string
  client_id: string
  invoice_date: string
  description: string
  amount: string
  status: 'paid' | 'open'
  zoho_link: string
  created_at: string
}

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = await createClient()
  const supabaseAdmin = createAdminClient()
  const { client_id: clientId } = await searchParams
  const mfaFlash = await getFlash()

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

  let profile: DashboardProfile | null = null
  let tickets: DashboardTicket[] = []
  let invoices: DashboardInvoice[] = []

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

  const websiteId = typeof profile?.umami_website_id === 'string' ? profile.umami_website_id : null
  const statusSlug = typeof profile?.kuma_status_slug === 'string' ? profile.kuma_status_slug : null

  // Fetch Umami analytics stats (30-day) — uses client's website ID if set, otherwise global default
  const umamiStats = await getUmamiStats(websiteId)

  // Fetch Umami pageview time-series for chart
  const umamiPageviews = await getUmamiPageviews(websiteId)

  // Fetch Uptime Kuma monitors — uses client's status slug if set, otherwise global default
  const kumaMonitors = await getKumaMonitors(statusSlug)

  // Fetch domain expiration if configured for this client
  let domainExpiration: DomainExpiration | null = null
  const expDomain = typeof profile?.domain_expiry_domain === 'string'
    ? profile.domain_expiry_domain
    : null
  if (expDomain) {
    try {
      domainExpiration = await getDomainExpiration(expDomain)
    } catch {
      // WHOIS failed gracefully — dashboard still loads
      domainExpiration = null
    }
  }

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
          domainExpiration={domainExpiration}
          mfaFlash={mfaFlash}
        />
      </div>
    </div>
  )
}