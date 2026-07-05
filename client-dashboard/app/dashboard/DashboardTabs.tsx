'use client'

import { useState, useEffect, useRef } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { createTicket, replyToTicket } from './actions'
import { signout } from '@/app/auth/callback/actions'
import { useAutoLogout } from '@/hooks/useAutoLogout'
import type { UmamiStats, UmamiPageviews } from '@/utils/umami'
import type { KumaMonitor } from '@/utils/kuma'
import type { DomainExpiration } from '@/utils/whois'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

interface KumaBadge {
  label: string
  url: string
}

interface TicketMessage {
  id: string
  ticket_id: string
  sender_type: 'client' | 'admin'
  message: string
  image_url?: string | null
  created_at: string
}

interface Ticket {
  id: string
  client_id: string
  title: string
  description: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
  updated_at?: string
  closed_at?: string
  ticket_messages?: TicketMessage[]
}

interface Profile {
  id: string
  company_name: string | null
  uptime_url: string | null
  analytics_url: string | null
  umami_website_id?: string | null
  kuma_status_slug?: string | null
  kuma_badges?: KumaBadge[] | null
  updated_at?: string | null
}

interface Invoice {
  id: string
  client_id: string
  invoice_date: string
  description: string
  amount: string
  status: 'paid' | 'open'
  zoho_link: string
  created_at: string
}

type TabType = 'analytics' | 'uptime' | 'tickets' | 'invoices'

export default function DashboardTabs({
  profile,
  initialTickets,
  umamiStats,
  umamiPageviews,
  kumaMonitors,
  initialInvoices,
  isViewingAsAdmin = false,
  domainExpiration = null,
}: {
  profile: Profile | null
  initialTickets: Ticket[]
  umamiStats: UmamiStats | null
  umamiPageviews: UmamiPageviews | null
  kumaMonitors: KumaMonitor[]
  initialInvoices: Invoice[]
  isViewingAsAdmin?: boolean
  domainExpiration?: DomainExpiration | null
}) {
  const [activeTab, setActiveTab] = useState<TabType>('analytics')
  const [showNewTicketForm, setShowNewTicketForm] = useState(false)
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false)
  const [ticketMessage, setTicketMessage] = useState('')
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyFile, setReplyFile] = useState<File | null>(null)
  const [replySubmitting, setReplySubmitting] = useState(false)
  const [replyError, setReplyError] = useState('')

  useAutoLogout(30)

  // Live-updating pageview data for the chart
  const [livePageviews, setLivePageviews] = useState(umamiPageviews)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const websiteId = profile?.umami_website_id
    if (!websiteId) return

    const id = websiteId // narrowed to string after guard above

    async function refresh() {
      try {
        const res = await fetch(`/api/analytics/pageviews?websiteId=${encodeURIComponent(id)}&days=3`)
        if (res.ok) {
          const data: UmamiPageviews = await res.json()
          setLivePageviews(data)
        }
      } catch {
        // silently ignore polling errors
      }
    }

    // initial refresh to pick up any data since SSR
    refresh()

    pollTimerRef.current = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
      }
    }
  }, [profile?.umami_website_id])

  async function handleTicketSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmittingTicket(true)
    setTicketMessage('')
    const form = event.currentTarget
    const formData = new FormData(form)
    try {
      await createTicket(formData)
      setTicketMessage('Ticket submitted successfully.')
      form.reset()
      setShowNewTicketForm(false)
    } catch (err) {
      setTicketMessage(err instanceof Error ? err.message : 'Failed to submit ticket.')
    } finally {
      setIsSubmittingTicket(false)
    }
  }

  async function handleReply(ticketId: string) {
    if (!replyText.trim()) return
    setReplySubmitting(true)
    setReplyError('')
    const formData = new FormData()
    formData.set('ticket_id', ticketId)
    formData.set('message', replyText)
    if (replyFile) {
      formData.set('attachment', replyFile)
    }
    try {
      await replyToTicket(formData)
      setReplyText('')
      setReplyFile(null)
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Failed to send reply.')
    } finally {
      setReplySubmitting(false)
    }
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
      resolved: 'bg-blue-50 text-blue-700 border-blue-200',
      closed: 'bg-slate-100 text-slate-700 border-slate-200',
    }
    return (
      <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium capitalize ${styles[status] || styles.open}`}>
        {status.replace('_', ' ')}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Admin preview banner */}
      {isViewingAsAdmin && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex items-center justify-between">
          <p className="text-sm text-amber-800">
            You are viewing <strong>{profile?.company_name || 'this client'}&rsquo;s</strong> dashboard.
          </p>
          <a href="/admin" className="text-sm font-medium text-amber-700 hover:text-amber-600 underline">
            ← Back to Admin
          </a>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold text-slate-800">{profile?.company_name || 'Dashboard'}</h2></div>
        <form action={signout}>
          <button type="submit" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Sign Out</button>
        </form>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-3 sm:space-x-8 overflow-x-auto" aria-label="Tabs">
          {(['analytics', 'uptime', 'tickets', 'invoices'] as TabType[]).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 py-3 sm:py-4 px-0.5 sm:px-1 text-xs sm:text-sm font-medium capitalize flex-shrink-0 ${
                activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}>
              {tab === 'analytics' ? 'Analytics' : tab === 'uptime' ? 'Uptime Status' : tab === 'tickets' ? 'Support Desk' : 'Invoices'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {umamiStats ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Visitors" value={umamiStats.visitors} />
                <StatCard label="Page Views" value={umamiStats.pageviews} />
                <StatCard label="Bounce Rate" value={umamiStats.visits > 0 ? Math.round((umamiStats.bounces / umamiStats.visits) * 100) : 0} suffix="%" />
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><p className="text-center text-slate-500">Unable to load analytics data.</p></div>
            )}
            {livePageviews && livePageviews.pageviews.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">Page Views & Sessions (auto-refreshes)</h4>
                <PageviewChart data={livePageviews} />
              </div>
            )}
            <p className="text-xs text-slate-400">Data from Umami — last 3 days</p>
            <a
              href="https://analytics.totaldsgn.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-500 font-medium mt-1"
            >
              View more Statistics →
            </a>
          </div>
        )}

        {activeTab === 'uptime' && (
          <div className="space-y-6">
            {profile?.kuma_badges && Array.isArray(profile.kuma_badges) && profile.kuma_badges.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h4 className="text-sm font-semibold text-slate-700 mb-4">Status</h4>
                <div className="flex flex-wrap gap-4">
                  {profile.kuma_badges.map((badge, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={badge.url} alt={badge.label || 'Badge'} className="h-8" />
                      {badge.label && <span className="text-xs text-slate-500">{badge.label}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Domain Expiration Card */}
            {domainExpiration && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Domain Expiration</h4>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5 shadow-sm">
                  <p className="text-sm font-medium text-slate-500">
                    {domainExpiration.domain}
                  </p>
                  {domainExpiration.expiryDate ? (
                    <>
                      <p className="mt-1 text-2xl font-bold text-slate-900">
                        {new Date(domainExpiration.expiryDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                      <p className={`mt-1 text-lg font-semibold ${
                        (domainExpiration.daysRemaining ?? 0) <= 30
                          ? 'text-red-600'
                          : (domainExpiration.daysRemaining ?? 0) <= 90
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                      }`}>
                        {domainExpiration.daysRemaining?.toLocaleString()} days
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-red-500">
                      {domainExpiration.error || 'Could not determine expiration date'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {kumaMonitors.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {kumaMonitors.map((monitor) => (
                  <div key={monitor.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-3 w-3 rounded-full bg-emerald-500" />
                      <div><h4 className="text-sm font-semibold text-slate-900">{monitor.name}</h4></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !domainExpiration && (
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><p className="text-center text-slate-500">Unable to load uptime monitors.</p></div>
              )
            )}
            <p className="text-xs text-slate-400">Data from Uptime Kuma</p>
          </div>
        )}

        {/* === INVOICES TAB === */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Invoices</h3>
              <p className="text-sm text-slate-500">Download or pay your invoice online.</p>
            </div>
            {initialInvoices.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
                <p className="text-slate-500">No invoices yet.</p>
              </div>
            ) : (
              <>
                {/* Desktop table: visible sm and up */}
                <div className="hidden sm:block rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {initialInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-slate-700">
                            {new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-slate-700">{inv.description}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-slate-700">{inv.amount || '—'}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium capitalize ${
                              inv.status === 'paid'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <a
                              href={inv.zoho_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                            >
                              View Invoice ↗
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards: visible below sm */}
                <div className="sm:hidden space-y-3">
                  {initialInvoices.map((inv) => (
                    <div key={inv.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString()}
                        </span>
                        <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium capitalize ${
                          inv.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {inv.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{inv.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700">{inv.amount || '—'}</span>
                        <a
                          href={inv.zoho_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                        >
                          View Invoice ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* === TICKETS TAB === */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div><h3 className="text-lg font-semibold text-slate-900">Support Tickets</h3><p className="text-sm text-slate-500">Need help? Create a new ticket and track its resolution.</p></div>
              {!isViewingAsAdmin && (
                <button onClick={() => { setShowNewTicketForm(!showNewTicketForm); setTicketMessage('') }}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500">
                  {showNewTicketForm ? 'Cancel' : 'New Ticket'}
                </button>
              )}
            </div>

            {ticketMessage && (
              <div className={`rounded-md p-3 text-sm ${ticketMessage.includes('successfully') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{ticketMessage}</div>
            )}

            {showNewTicketForm && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h4 className="text-md font-medium text-slate-900 mb-4">Submit a New Support Ticket</h4>
                <form onSubmit={handleTicketSubmit} className="space-y-4">
                  <div><label htmlFor="title" className="block text-sm font-medium text-slate-700">Subject</label><input type="text" id="title" name="title" required placeholder="e.g., Cannot access server, site slow" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /></div>
                  <div><label htmlFor="description" className="block text-sm font-medium text-slate-700">Description</label><textarea id="description" name="description" required rows={4} placeholder="Provide details about the issue..." className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /></div>
                  <div><label className="block text-sm font-medium text-slate-700">Screenshot (optional, max 2MB)</label><input type="file" name="attachment" accept="image/*" className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" /></div>
                  <button type="submit" disabled={isSubmittingTicket} className="inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">{isSubmittingTicket ? 'Submitting...' : 'Submit Ticket'}</button>
                </form>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              {initialTickets.length > 0 ? (
                <div className="divide-y divide-slate-200">
                  {initialTickets.map((ticket) => (
                    <div key={ticket.id}>
                      <button onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
                        className="w-full p-6 text-left hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <h4 className="text-md font-semibold text-slate-900 truncate">{ticket.title}</h4>
                              {getStatusBadge(ticket.status)}
                            </div>
                            <p className="text-xs text-slate-400">{new Date(ticket.created_at).toLocaleString()} · {(ticket.ticket_messages?.length || 0)} message(s)</p>
                          </div>
                        </div>
                      </button>

                      {expandedTicket === ticket.id && (
                        <div className="px-6 pb-6 space-y-4 border-t border-slate-100 pt-4">
                          {/* Messages */}
                          {ticket.ticket_messages && ticket.ticket_messages.length > 0 && (
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                              {ticket.ticket_messages.map((msg) => (
                                <div key={msg.id} className={`flex ${msg.sender_type === 'admin' ? 'justify-start' : 'justify-end'}`}>
                                  <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                    msg.sender_type === 'admin' ? 'bg-indigo-50 text-indigo-900' : 'bg-slate-100 text-slate-800'
                                  }`}>
                                    <p className="text-xs font-medium mb-1">{msg.sender_type === 'admin' ? 'Support Team' : 'You'}
                                      <span className="font-normal text-slate-400 ml-2">{new Date(msg.created_at).toLocaleString()}</span>
                                    </p>
                                    <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                    {msg.image_url && (
                                      <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={msg.image_url} alt="Screenshot" className="mt-2 max-h-40 rounded" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Reply form */}
                          {ticket.status !== 'closed' && (
                            <form onSubmit={(e) => { e.preventDefault(); handleReply(ticket.id) }} className="space-y-3">
                              {replyError && <p className="text-sm text-red-600">{replyError}</p>}
                              <textarea
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Add a reply..."
                                rows={3}
                                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                              />
                              <div className="flex gap-2 items-center">
                                <input type="file" accept="image/*" onChange={(e) => setReplyFile(e.target.files?.[0] || null)}
                                  className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-indigo-50 file:text-indigo-700" />
                                <button type="submit" disabled={replySubmitting || !replyText.trim()}
                                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">
                                  {replySubmitting ? 'Sending...' : 'Reply'}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500"><p>You haven&apos;t submitted any support tickets yet.</p></div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PageviewChart({ data }: { data: UmamiPageviews }) {
  const chartData = data.pageviews.map((pv, i) => ({
    date: new Date(pv.x.replace(' ', 'T')),
    label: new Date(pv.x.replace(' ', 'T')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    pageviews: pv.y,
    visitors: data.sessions[i]?.y ?? 0,
  }))
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#6366f1]" />Visitors</span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#34d399]" />Views</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} barCategoryGap="20%" barGap={0}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dy={8} interval="preserveStartEnd" />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} dx={-4} allowDecimals={false} />
          <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '13px' }}
            labelFormatter={(label, payload) => {
              if (payload?.[0]) return (payload[0].payload as { date: Date }).date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })
              return label
            }}
            formatter={(value, name) => [(Number(value) || 0).toLocaleString(), name === 'visitors' ? 'Visitors' : 'Page Views']} />
          <Bar dataKey="visitors" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={24} />
          <Bar dataKey="pageviews" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value.toLocaleString()}{suffix && <span className="text-lg font-normal text-slate-400">{suffix}</span>}</p>
    </div>
  )
}