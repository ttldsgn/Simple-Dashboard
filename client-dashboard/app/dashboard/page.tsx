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
  project_id?: string
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
  project_id?: string
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
  let projectId: string | null = null

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

  // Use admin client when viewing as admin to bypass RLS
  const queryClient = isViewingAsAdmin ? supabaseAdmin : supabase

  // Fetch profile (auth-level fields: role, uptime_url, analytics_url)
  let profileData: {
    id: string
    uptime_url: string | null
    analytics_url: string | null
    updated_at: string | null
    role: string
  } | null = null
  try {
    const { data } = await queryClient
      .from('profiles')
      .select('id, uptime_url, analytics_url, updated_at, role')
      .eq('id', effectiveUserId)
      .maybeSingle()
    profileData = data
  } catch {
    // Table may not exist yet
  }

  // Fetch project settings via project_members join
  let projectData: {
    id: string
    company_name: string | null
    umami_website_id: string | null
    kuma_status_slug: string | null
    kuma_badges: Array<{ label: string; url: string }> | null
    domain_expiry_domain: string | null
    updated_at: string | null
  } | null = null
  try {
    // First find the user's project_members row
    const { data: memberRow } = await queryClient
      .from('project_members')
      .select('project_id')
      .eq('user_id', effectiveUserId)
      .maybeSingle()

    if (memberRow?.project_id) {
      projectId = memberRow.project_id

      // Then fetch the project details
      const { data: proj } = await queryClient
        .from('projects')
        .select('id, company_name, umami_website_id, kuma_status_slug, kuma_badges, domain_expiry_domain, updated_at')
        .eq('id', projectId)
        .maybeSingle()

      if (proj) {
        projectData = proj as {
          id: string
          company_name: string | null
          umami_website_id: string | null
          kuma_status_slug: string | null
          kuma_badges: Array<{ label: string; url: string }> | null
          domain_expiry_domain: string | null
          updated_at: string | null
        }
      }
    }
  } catch {
    // project_members/projects tables may not exist yet
  }

  // Assemble the dashboard profile from both sources
  const profile: DashboardProfile = {
    id: effectiveUserId,
    company_name: projectData?.company_name || null,
    uptime_url: profileData?.uptime_url || null,
    analytics_url: profileData?.analytics_url || null,
    umami_website_id: projectData?.umami_website_id || null,
    kuma_status_slug: projectData?.kuma_status_slug || null,
    kuma_badges: projectData?.kuma_badges || null,
    domain_expiry_domain: projectData?.domain_expiry_domain || null,
    updated_at: profileData?.updated_at || projectData?.updated_at || null,
  }

  // Fetch tickets — use client_id (still on the table) and/or project_id
  let tickets: DashboardTicket[] = []
  try {
    const query = queryClient
      .from('tickets')
      .select('*, ticket_messages(*)')
      .eq('client_id', effectiveUserId)
      .order('created_at', { ascending: false })

    const { data: ticketData } = await query
    tickets = ticketData ?? []
  } catch {
    // Table may not exist yet
  }

  // Fetch invoices
  let invoices: DashboardInvoice[] = []
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

  // Fetch Umami analytics stats (30-day)
  const umamiStats = await getUmamiStats(websiteId)

  // Fetch Umami pageview time-series for chart
  const umamiPageviews = await getUmamiPageviews(websiteId)

  // Fetch Uptime Kuma monitors
  const kumaMonitors = await getKumaMonitors(statusSlug)

  // Fetch domain expiration if configured
  let domainExpiration: DomainExpiration | null = null
  const expDomain = typeof profile?.domain_expiry_domain === 'string'
    ? profile.domain_expiry_domain
    : null
  if (expDomain) {
    try {
      domainExpiration = await getDomainExpiration(expDomain)
    } catch {
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