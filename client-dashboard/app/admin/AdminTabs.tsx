'use client'

import { useState, useCallback } from 'react'
import { useAutoLogout } from '@/hooks/useAutoLogout'
import {
  inviteUser,
  updateClient,
  resendInvite,
  deleteClient,
  deleteProject,
} from '@/app/auth/callback/actions'
import { adminReplyToTicket, adminUpdateTicketStatus, deleteTickets, addInvoice, updateInvoiceStatus, updateInvoice, deleteInvoice } from '@/app/dashboard/actions'
import MfaCard from '@/components/MfaCard'

interface KumaBadge {
  label: string
  url: string
}

interface ClientProfile {
  id: string
  company_name: string | null
  umami_website_id: string | null
  kuma_status_slug: string | null
  kuma_badges?: KumaBadge[] | null
  domain_expiry_domain?: string | null
  role: string
  created_at?: string
  updated_at?: string
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

interface Props {
  clients: ClientProfile[]
  emailMap: Record<string, string>
  companyNameMap: Record<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projects: any[]
  userProjectMap: Record<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projectMap: Record<string, any>
  tickets: Ticket[]
  allInvoices: Invoice[]
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

export default function AdminTabs({ clients, emailMap, companyNameMap, projects, userProjectMap, projectMap, tickets, allInvoices }: Props) {
  const [activeTab, setActiveTab] = useState<'clients' | 'invite' | 'tickets' | 'invoices' | 'projects'>('clients')
  const [editingClient, setEditingClient] = useState<ClientProfile | null>(null)
  const [message, setMessage] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<Record<string, string>>({})
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null)
  const [ticketReply, setTicketReply] = useState('')
  const [ticketStatusMsg, setTicketStatusMsg] = useState('')

  // Invite mode: 'existing' = add to existing project, 'new' = create new project
  const [inviteMode, setInviteMode] = useState<'existing' | 'new'>('existing')
  const [inviteSelectedProject, setInviteSelectedProject] = useState('')

  // Ticket bulk delete state
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set())
  const [isDeletingTickets, setIsDeletingTickets] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Invoice state
  const [invoiceClientId, setInvoiceClientId] = useState('')
  const [invoiceForm, setInvoiceForm] = useState({ date: '', description: '', amount: '', status: 'open' as 'paid' | 'open', link: '' })
  const [invoiceMsg, setInvoiceMsg] = useState('')

  // Invoice list filter state
  const [invFilterClient, setInvFilterClient] = useState('')
  const [invFilterStatus, setInvFilterStatus] = useState<'all' | 'paid' | 'open'>('all')

  // Invoice edit state
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [editInvoiceForm, setEditInvoiceForm] = useState({ date: '', description: '', amount: '', status: 'open' as 'paid' | 'open', link: '' })

  // Invoice delete confirm
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null)

  // Badge editing state
  const [editBadges, setEditBadges] = useState<KumaBadge[]>([])
  const [inviteBadges, setInviteBadges] = useState<KumaBadge[]>([])

  useAutoLogout(30)

  function defaultBadges(client: ClientProfile): KumaBadge[] {
    return (client.kuma_badges && Array.isArray(client.kuma_badges))
      ? [...client.kuma_badges]
      : []
  }

  function startEdit(client: ClientProfile) {
    setEditingClient(client)
    setEditBadges(defaultBadges(client))
    setMessage('')
  }

  function addBadge(setter: React.Dispatch<React.SetStateAction<KumaBadge[]>>) {
    setter((prev) => [...prev, { label: '', url: '' }])
  }

  function removeBadge(index: number, setter: React.Dispatch<React.SetStateAction<KumaBadge[]>>) {
    setter((prev) => prev.filter((_, i) => i !== index))
  }

  function updateBadgeField(
    index: number,
    field: 'label' | 'url',
    value: string,
    setter: React.Dispatch<React.SetStateAction<KumaBadge[]>>
  ) {
    setter((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)))
  }

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setInviteMessage('')
    const formData = new FormData(event.currentTarget)
    if (inviteMode === 'existing') {
      formData.set('project_id', inviteSelectedProject)
    } else {
      formData.set('kuma_badges', JSON.stringify(inviteBadges.filter(b => b.label || b.url)))
    }
    const result = await inviteUser(formData)
    if (result && 'error' in result && result.error) {
      setInviteMessage(`Error: ${result.error}`)
    } else {
      setInviteMessage('Invitation sent successfully!')
      ;(event.target as HTMLFormElement).reset()
      setInviteBadges([])
      setInviteSelectedProject('')
    }
    setIsSubmitting(false)
  }

  async function handleUpdateClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    const formData = new FormData(event.currentTarget)
    formData.set('kuma_badges', JSON.stringify(editBadges.filter(b => b.label || b.url)))
    // Include project_id if we have it for this client
    const projectId = userProjectMap[editingClient?.id || '']
    if (projectId) {
      formData.set('project_id', projectId)
    }
    const result = await updateClient(formData)
    if (result && 'error' in result && result.error) {
      setMessage(`Error: ${result.error}`)
    } else {
      setMessage('Client updated successfully!')
      setEditingClient(null)
      setEditBadges([])
    }
    setIsSubmitting(false)
  }

  async function handleResendInvite(clientId: string) {
    setResendStatus((prev) => ({ ...prev, [clientId]: 'sending' }))
    const formData = new FormData()
    formData.set('client_id', clientId)
    const result = await resendInvite(formData)
    if (result && 'error' in result && result.error) {
      setResendStatus((prev) => ({ ...prev, [clientId]: `Error: ${result.error}` }))
    } else {
      setResendStatus((prev) => ({ ...prev, [clientId]: 'Invite resent!' }))
      setTimeout(() => {
        setResendStatus((prev) => {
          const next = { ...prev }
          delete next[clientId]
          return next
        })
      }, 3000)
    }
  }

  async function handleDeleteClient(clientId: string) {
    setIsSubmitting(true)
    const formData = new FormData()
    formData.set('client_id', clientId)
    const result = await deleteClient(formData)
    if (result && 'error' in result && result.error) {
      setMessage(`Error: ${result.error}`)
    } else {
      setMessage('Client deleted successfully.')
      setDeleteConfirmId(null)
    }
    setIsSubmitting(false)
  }

  async function handleAdminReply(ticketId: string) {
    if (!ticketReply.trim()) return
    setIsSubmitting(true)
    const formData = new FormData()
    formData.set('ticket_id', ticketId)
    formData.set('message', ticketReply)
    await adminReplyToTicket(formData)
    setTicketReply('')
    setIsSubmitting(false)
  }

  async function handleStatusChange(ticketId: string, status: string) {
    setTicketStatusMsg('')
    const formData = new FormData()
    formData.set('ticket_id', ticketId)
    formData.set('status', status)
    try {
      await adminUpdateTicketStatus(formData)
    } catch (err) {
      setTicketStatusMsg(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  function moveBadge(fromIndex: number, toIndex: number, setter: React.Dispatch<React.SetStateAction<KumaBadge[]>>) {
    setter((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
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

  // Toggle a single ticket selection
  const toggleTicket = useCallback((ticketId: string) => {
    setSelectedTickets(prev => {
      const next = new Set(prev)
      if (next.has(ticketId)) {
        next.delete(ticketId)
      } else {
        next.add(ticketId)
      }
      return next
    })
  }, [])

  // Toggle select all tickets
  const toggleAllTickets = useCallback(() => {
    setSelectedTickets(prev => {
      if (prev.size === tickets.length) {
        return new Set()
      }
      return new Set(tickets.map(t => t.id))
    })
  }, [tickets])

  // Bulk delete tickets
  async function handleBulkDelete() {
    if (selectedTickets.size === 0) return
    setIsDeletingTickets(true)
    const formData = new FormData()
    formData.set('ticket_ids', Array.from(selectedTickets).join(','))
    try {
      await deleteTickets(formData)
      setSelectedTickets(new Set())
      setShowDeleteConfirm(false)
    } catch (err) {
      setTicketStatusMsg(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setIsDeletingTickets(false)
    }
  }

  function renderBadgeFields(
    badges: KumaBadge[],
    setter: React.Dispatch<React.SetStateAction<KumaBadge[]>>
  ) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500">Kuma Badges</p>
          <button type="button" onClick={() => addBadge(setter)} className="text-xs font-medium text-indigo-600 hover:text-indigo-500">
            + Add Badge
          </button>
        </div>
        {badges.map((badge, i) => (
          <div
            key={i}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(i))
              ;(e.currentTarget as HTMLElement).classList.add('opacity-50')
            }}
            onDragEnd={(e) => { ;(e.currentTarget as HTMLElement).classList.remove('opacity-50') }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              ;(e.currentTarget as HTMLElement).classList.add('ring-2', 'ring-indigo-300')
            }}
            onDragLeave={(e) => { ;(e.currentTarget as HTMLElement).classList.remove('ring-2', 'ring-indigo-300') }}
            onDrop={(e) => {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement).classList.remove('ring-2', 'ring-indigo-300')
              const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
              if (!isNaN(fromIndex) && fromIndex !== i) moveBadge(fromIndex, i, setter)
            }}
            className="flex gap-2 items-start cursor-default"
          >
            <span className="mt-2 cursor-grab text-slate-300 hover:text-slate-500 select-none" title="Drag to reorder">⠿</span>
            <input
              type="text" placeholder="Label (e.g. Status)" value={badge.label}
              onChange={(e) => updateBadgeField(i, 'label', e.target.value, setter)}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            <input
              type="url" placeholder="https://status.totaldsgn.com/api/badge/2/status" value={badge.url}
              onChange={(e) => updateBadgeField(i, 'url', e.target.value, setter)}
              className="flex-[2] rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            <button type="button" onClick={() => removeBadge(i, setter)} className="rounded-md border border-red-200 px-2 py-2 text-xs text-red-500 hover:bg-red-50" title="Remove badge">✕</button>
          </div>
        ))}
        {badges.length === 0 && (
          <p className="text-xs text-slate-400">No badges configured.</p>
        )}
      </div>
    )
  }

  const openTickets = tickets.filter(t => t.status !== 'closed')

  return (
    <div className="space-y-6">
      {/* Admin MFA Status */}
      <MfaCard />

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {(['clients', 'invite', 'tickets', 'invoices', 'projects'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium capitalize ${
                activeTab === tab
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab === 'clients' ? 'Clients' : tab === 'invite' ? 'Invite' : tab === 'tickets' ? (
                <span>Tickets {openTickets.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-indigo-100 px-1.5 py-0.5 text-xs font-bold text-indigo-700">
                    {openTickets.length}
                  </span>
                )}</span>
              ) : tab === 'projects' ? 'Projects' : 'Invoices'}
            </button>
          ))}
        </nav>
      </div>

      {/* === TICKETS TAB === */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {ticketStatusMsg && (
            <div className={`rounded-md p-3 text-sm ${ticketStatusMsg.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {ticketStatusMsg}
            </div>
          )}
          {tickets.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
              <p className="text-slate-500">No tickets yet.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              {/* Bulk actions bar */}
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedTickets.size === tickets.length && tickets.length > 0}
                    onChange={toggleAllTickets}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {selectedTickets.size > 0
                    ? `${selectedTickets.size} selected`
                    : 'Select All'}
                </label>
                {selectedTickets.size > 0 && !showDeleteConfirm && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeletingTickets}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
                  >
                    Delete ({selectedTickets.size})
                  </button>
                )}
                {showDeleteConfirm && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-700">
                      Delete {selectedTickets.size} ticket(s)?
                    </span>
                    <button
                      onClick={handleBulkDelete}
                      disabled={isDeletingTickets}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
                    >
                      {isDeletingTickets ? 'Deleting...' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeletingTickets}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              <div className="divide-y divide-slate-200">
                {tickets.map((ticket) => (
                  <div key={ticket.id}>
                    <div className="flex items-center p-6 hover:bg-slate-50 transition-colors">
                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedTickets.has(ticket.id)}
                        onChange={() => toggleTicket(ticket.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 mr-4 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      />
                      {/* Ticket content */}
                      <button
                        onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <h4 className="text-md font-semibold text-slate-900 truncate">{ticket.title}</h4>
                              {getStatusBadge(ticket.status)}
                            </div>
                            <p className="text-sm text-slate-500">
                              {companyNameMap[ticket.client_id] && (
                                <strong>{companyNameMap[ticket.client_id]}</strong>
                              )}{' '}
                              {emailMap[ticket.client_id] || 'Unknown'} · {new Date(ticket.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <span className="text-xs text-slate-400 ml-4">
                            {(ticket.ticket_messages?.length || 0)} message(s)
                          </span>
                        </div>
                      </button>
                    </div>

                    {expandedTicket === ticket.id && (
                      <div className="px-6 pb-6 space-y-4 border-t border-slate-100 pt-4">
                        {/* Messages */}
                        {ticket.ticket_messages && ticket.ticket_messages.length > 0 && (
                          <div className="space-y-3 max-h-96 overflow-y-auto">
                            {ticket.ticket_messages.map((msg) => (
                              <div key={msg.id} className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
                                  msg.sender_type === 'admin'
                                    ? 'bg-indigo-50 text-indigo-900'
                                    : 'bg-slate-100 text-slate-800'
                                }`}>
                                  <p className="text-xs font-medium mb-1">
                                    {msg.sender_type === 'admin' ? 'Admin' : emailMap[ticket.client_id] || 'Client'}
                                    <span className="font-normal text-slate-400 ml-2">
                                      {new Date(msg.created_at).toLocaleString()}
                                    </span>
                                  </p>
                                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                  {msg.image_url && (
                                    <a href={msg.image_url} target="_blank" rel="noreferrer">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={msg.image_url} alt="Screenshot" className="mt-2 max-h-40 rounded" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Status controls */}
                        <div className="flex gap-2 flex-wrap">
                          {(['open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(ticket.id, s)}
                              disabled={ticket.status === s || isSubmitting}
                              className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize disabled:opacity-50 ${
                                ticket.status === s
                                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {s.replace('_', ' ')}
                            </button>
                          ))}
                        </div>

                        {/* Reply form */}
                        {ticket.status !== 'closed' && (
                          <form onSubmit={(e) => { e.preventDefault(); handleAdminReply(ticket.id) }} className="flex gap-2">
                            <input
                              type="text"
                              value={ticketReply}
                              onChange={(e) => setTicketReply(e.target.value)}
                              placeholder="Type your reply..."
                              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            />
                            <button
                              type="submit"
                              disabled={isSubmitting || !ticketReply.trim()}
                              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                            >
                              {isSubmitting ? 'Sending...' : 'Reply'}
                            </button>
                          </form>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clients Tab */}
      {activeTab === 'clients' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Clients ({clients.length})</h3>
          {message && (
            <div className={`rounded-md p-3 text-sm ${message.includes('successfully') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{message}</div>
          )}
          {clients.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm"><p className="text-slate-500">No clients yet.</p></div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-200">
                {clients.map((client) => (
                  <div key={client.id} className="p-6">
                    {editingClient?.id === client.id ? (
                      <form onSubmit={handleUpdateClient} className="space-y-4">
                        <input type="hidden" name="client_id" value={client.id} />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div><label className="block text-xs font-medium text-slate-500 mb-1">Company Name</label><input type="text" name="company_name" defaultValue={client.company_name || ''} className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" /></div>
                          <div><label className="block text-xs font-medium text-slate-500 mb-1">Umami Website ID</label><input type="text" name="umami_website_id" defaultValue={client.umami_website_id || ''} className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" /></div>
                          <div className="sm:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Kuma Status Slug</label><input type="text" name="kuma_status_slug" defaultValue={client.kuma_status_slug || ''} className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" /></div>
                          <div className="sm:col-span-2"><label className="block text-xs font-medium text-slate-500 mb-1">Domain (Expiration Lookup)</label><input type="text" name="domain_expiry_domain" defaultValue={client.domain_expiry_domain || ''} placeholder="e.g., example.com" className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" /><p className="mt-1 text-xs text-slate-400">The domain to check WHOIS expiration for (e.g., example.com).</p></div>
                          <div className="sm:col-span-2">{renderBadgeFields(editBadges, setEditBadges)}</div>
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button type="submit" disabled={isSubmitting} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save'}</button>
                          <button type="button" onClick={() => { setEditingClient(null); setEditBadges([]); setMessage('') }} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Cancel</button>
                        </div>
                      </form>
                    ) : deleteConfirmId === client.id ? (
                      <div className="space-y-4">
                        <p className="text-sm text-slate-700">Are you sure you want to permanently delete <strong>{client.company_name || emailMap[client.id] || 'this client'}</strong>? This will remove their account and all data.</p>
                        <div className="flex gap-3">
                          <button type="button" onClick={() => handleDeleteClient(client.id)} disabled={isSubmitting} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50">{isSubmitting ? 'Deleting...' : 'Yes, Delete'}</button>
                          <button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h4 className="text-md font-semibold text-slate-900">{client.company_name || emailMap[client.id] || 'Unnamed Client'}</h4>
                          <p className="text-sm text-slate-500">{emailMap[client.id] || 'No email'}</p>
                          <div className="flex gap-4 mt-2 text-xs text-slate-400"><span>Umami ID: {client.umami_website_id || '—'}</span><span>Kuma Slug: {client.kuma_status_slug || '—'}</span></div>
                          {client.kuma_badges && Array.isArray(client.kuma_badges) && client.kuma_badges.length > 0 && (
                            <div className="flex gap-2 mt-1 flex-wrap">{client.kuma_badges.map((b, i) => (<span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{b.label || 'Badge'}</span>))}</div>
                          )}
                          {client.created_at && (<p className="text-xs text-slate-400 pt-1">Joined {new Date(client.created_at).toLocaleDateString()}</p>)}
                          {resendStatus[client.id] && (<p className={`text-xs ${resendStatus[client.id].includes('Error') ? 'text-red-600' : 'text-green-600'}`}>{resendStatus[client.id]}</p>)}
                        </div>
                        <div className="flex items-center gap-2">
                          <a href={`/dashboard?client_id=${client.id}`}
                            className="rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 shadow-sm hover:bg-indigo-50">
                            View Dashboard
                          </a>
                          <button onClick={() => startEdit(client)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50">Edit</button>
                          <button onClick={() => handleResendInvite(client.id)} disabled={resendStatus[client.id] === 'sending'} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50">{resendStatus[client.id] === 'sending' ? 'Sending...' : 'Resend Invite'}</button>
                          <button onClick={() => setDeleteConfirmId(client.id)} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-red-50">Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === INVOICES TAB === */}
      {activeTab === 'invoices' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Manage Invoices</h3>
            <p className="text-sm text-slate-500">Zoho invoice links for clients.</p>
          </div>

          {invoiceMsg && (
            <div className={`rounded-md p-3 text-sm ${invoiceMsg.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              {invoiceMsg}
            </div>
          )}

          {/* Add Invoice Form */}
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h4 className="text-md font-medium text-slate-900 mb-4">Add New Invoice</h4>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setIsSubmitting(true)
                setInvoiceMsg('')
                const fd = new FormData()
                fd.set('client_id', invoiceClientId)
                fd.set('invoice_date', invoiceForm.date)
                fd.set('description', invoiceForm.description)
                fd.set('amount', invoiceForm.amount)
                fd.set('status', invoiceForm.status)
                fd.set('zoho_link', invoiceForm.link)
                try {
                  await addInvoice(fd)
                  setInvoiceMsg('Invoice added successfully!')
                  setInvoiceForm({ date: '', description: '', amount: '', status: 'open', link: '' })
                } catch (err) {
                  setInvoiceMsg(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                } finally {
                  setIsSubmitting(false)
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Client <span className="text-red-500">*</span></label>
                <select
                  value={invoiceClientId}
                  onChange={(e) => setInvoiceClientId(e.target.value)}
                  required
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                >
                  <option value="">Select a client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name || emailMap[c.id] || 'Unnamed Client'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceForm.date}
                    onChange={(e) => setInvoiceForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                  <input
                    type="text"
                    placeholder="$500.00"
                    value={invoiceForm.amount}
                    onChange={(e) => setInvoiceForm((prev) => ({ ...prev, amount: e.target.value }))}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={invoiceForm.status}
                    onChange={(e) => setInvoiceForm((prev) => ({ ...prev, status: e.target.value as 'paid' | 'open' }))}
                    className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                  >
                    <option value="open">Open</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  placeholder="e.g., Website Development — July 2026"
                  value={invoiceForm.description}
                  onChange={(e) => setInvoiceForm((prev) => ({ ...prev, description: e.target.value }))}
                  required
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Zoho Invoice Link <span className="text-red-500">*</span></label>
                <input
                  type="url"
                  placeholder="https://zohoinvoicepay.com/invoice/..."
                  value={invoiceForm.link}
                  onChange={(e) => setInvoiceForm((prev) => ({ ...prev, link: e.target.value }))}
                  required
                  className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !invoiceClientId}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Adding...' : 'Add Invoice'}
              </button>
            </form>
          </div>

          {/* Filter bar */}
          <div className="flex gap-3 items-center">
            <select
              value={invFilterClient}
              onChange={(e) => setInvFilterClient(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name || emailMap[c.id] || 'Unnamed Client'}
                </option>
              ))}
            </select>
            <select
              value={invFilterStatus}
              onChange={(e) => setInvFilterStatus(e.target.value as 'all' | 'paid' | 'open')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          {/* Invoice list */}
          {(() => {
            const filtered = allInvoices.filter((inv) => {
              if (invFilterClient && inv.client_id !== invFilterClient) return false
              if (invFilterStatus !== 'all' && inv.status !== invFilterStatus) return false
              return true
            })

            if (filtered.length === 0) {
              return (
                <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
                  <p className="text-slate-500">No invoices found.</p>
                </div>
              )
            }

            return (
              <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Client</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {filtered.map((inv) => {
                      const clientName = companyNameMap[inv.client_id] || emailMap[inv.client_id] || 'Unknown'
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">{clientName}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                            {new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString()}
                          </td>

                          {editingInvoiceId === inv.id ? (
                            <>
                              <td className="px-4 py-3" colSpan={4}>
                                <form
                                  onSubmit={async (e) => {
                                    e.preventDefault()
                                    setIsSubmitting(true)
                                    const fd = new FormData()
                                    fd.set('invoice_id', inv.id)
                                    fd.set('invoice_date', editInvoiceForm.date)
                                    fd.set('description', editInvoiceForm.description)
                                    fd.set('amount', editInvoiceForm.amount)
                                    fd.set('status', editInvoiceForm.status)
                                    fd.set('zoho_link', editInvoiceForm.link)
                                    try {
                                      await updateInvoice(fd)
                                      setEditingInvoiceId(null)
                                    } catch (err) {
                                      setInvoiceMsg(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
                                    } finally {
                                      setIsSubmitting(false)
                                    }
                                  }}
                                  className="grid grid-cols-1 gap-2 sm:grid-cols-4"
                                >
                                  <input type="text" value={editInvoiceForm.description} onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, description: e.target.value }))} required className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" placeholder="Description" />
                                  <input type="text" value={editInvoiceForm.amount} onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, amount: e.target.value }))} className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900" placeholder="$" />
                                  <select value={editInvoiceForm.status} onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, status: e.target.value as 'paid' | 'open' }))} className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900">
                                    <option value="open">Open</option>
                                    <option value="paid">Paid</option>
                                  </select>
                                  <div className="flex gap-2">
                                    <button type="submit" disabled={isSubmitting} className="rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">Save</button>
                                    <button type="button" onClick={() => setEditingInvoiceId(null)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                                  </div>
                                  <input
                                    type="url"
                                    value={editInvoiceForm.link}
                                    onChange={(e) => setEditInvoiceForm(prev => ({ ...prev, link: e.target.value }))}
                                    required
                                    className="sm:col-span-4 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
                                    placeholder="https://zohoinvoicepay.com/invoice/..."
                                  />
                                </form>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-slate-700">{inv.description}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-slate-700">{inv.amount || '—'}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <button
                                  onClick={async () => {
                                    const fd = new FormData()
                                    fd.set('invoice_id', inv.id)
                                    fd.set('status', inv.status === 'paid' ? 'open' : 'paid')
                                    try { await updateInvoiceStatus(fd) } catch {}
                                  }}
                                  className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium capitalize cursor-pointer ${
                                    inv.status === 'paid'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                  }`}
                                  title="Click to toggle status"
                                >
                                  {inv.status}
                                </button>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingInvoiceId(inv.id)
                                      setEditInvoiceForm({ date: inv.invoice_date, description: inv.description, amount: inv.amount, status: inv.status, link: inv.zoho_link })
                                    }}
                                    className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                                  >
                                    Edit
                                  </button>
                                  {deletingInvoiceId === inv.id ? (
                                    <>
                                      <span className="text-xs text-red-600">Delete?</span>
                                      <button
                                        onClick={async () => {
                                          setIsSubmitting(true)
                                          const fd = new FormData()
                                          fd.set('invoice_id', inv.id)
                                          try { await deleteInvoice(fd); setDeletingInvoiceId(null) } catch {}
                                          setIsSubmitting(false)
                                        }}
                                        disabled={isSubmitting}
                                        className="text-xs font-medium text-red-600 hover:text-red-500 disabled:opacity-50"
                                      >
                                        Yes
                                      </button>
                                      <button onClick={() => setDeletingInvoiceId(null)} className="text-xs font-medium text-slate-500 hover:text-slate-700">No</button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => setDeletingInvoiceId(inv.id)}
                                      className="text-xs font-medium text-red-600 hover:text-red-500"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      {/* Invite Tab */}
      {activeTab === 'invite' && (
        <div className="max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-medium text-slate-900 mb-2">Invite a New Client</h3>
          <p className="text-sm text-slate-500 mb-6">Send an invitation email. The client will set their password and access their personalized dashboard.</p>
          {inviteMessage && (<div className={`rounded-md p-3 mb-4 text-sm ${inviteMessage.includes('successfully') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{inviteMessage}</div>)}

          {/* Project selection mode toggle */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-3">Project Assignment</label>
            <div className="flex rounded-lg border border-slate-300 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setInviteMode('existing')}
                className={`flex-1 rounded-md py-2 px-3 text-sm font-medium transition-colors ${
                  inviteMode === 'existing'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Add to Existing Project
              </button>
              <button
                type="button"
                onClick={() => setInviteMode('new')}
                className={`flex-1 rounded-md py-2 px-3 text-sm font-medium transition-colors ${
                  inviteMode === 'new'
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Create New Project
              </button>
            </div>
          </div>

          <form onSubmit={handleInvite} className="space-y-4">
            <div><label htmlFor="email" className="block text-sm font-medium text-slate-700">Email Address <span className="text-red-500">*</span></label><input type="email" id="email" name="email" required placeholder="client@example.com" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /></div>

            {inviteMode === 'existing' ? (
              <div>
                <label htmlFor="inv_project" className="block text-sm font-medium text-slate-700">Select Project <span className="text-red-500">*</span></label>
                <select
                  id="inv_project"
                  value={inviteSelectedProject}
                  onChange={(e) => setInviteSelectedProject(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                >
                  <option value="">Choose a project...</option>
                  {projects.map((p: { id: string; company_name?: string | null }) => (
                    <option key={p.id} value={p.id}>
                      {p.company_name || 'Unnamed Project'}
                    </option>
                  ))}
                </select>
                {projects.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">No projects exist yet. Switch to Create New Project to create one, or run the migration to create projects for existing clients.</p>
                )}
              </div>
            ) : (
              <>
                <div><label htmlFor="company_name" className="block text-sm font-medium text-slate-700">Company Name <span className="text-red-500">*</span></label><input type="text" id="company_name" name="company_name" required placeholder="Acme Corp" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /></div>
                <div><label htmlFor="umami_website_id" className="block text-sm font-medium text-slate-700">Umami Website ID</label><input type="text" id="umami_website_id" name="umami_website_id" placeholder="Leave blank for global default" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /><p className="mt-1 text-xs text-slate-400">Found in Umami → Settings → Websites.</p></div>
                <div><label htmlFor="kuma_status_slug" className="block text-sm font-medium text-slate-700">Kuma Status Page Slug</label><input type="text" id="kuma_status_slug" name="kuma_status_slug" placeholder="Leave blank for global default" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /><p className="mt-1 text-xs text-slate-400">The URL path after /status/ in Kuma.</p></div>
                <div><label htmlFor="inv_domain_expiry_domain" className="block text-sm font-medium text-slate-700">Domain (for expiration lookup)</label><input type="text" id="inv_domain_expiry_domain" name="domain_expiry_domain" placeholder="e.g., example.com" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" /><p className="mt-1 text-xs text-slate-400">The domain to check WHOIS expiration for (e.g., example.com).</p></div>
                <div>{renderBadgeFields(inviteBadges, setInviteBadges)}</div>
              </>
            )}
            <button type="submit" disabled={isSubmitting} className="inline-flex justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50">{isSubmitting ? 'Sending Invitation...' : 'Send Invitation'}</button>
          </form>
        </div>
      )}
    </div>
  )
}