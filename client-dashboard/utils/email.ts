'use server'

import nodemailer from 'nodemailer'

interface EmailPayload {
  to: string
  subject: string
  html: string
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeForHeader(value: string) {
  return value.replace(/[\r\n]/g, ' ').trim()
}

function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!configuredUrl) {
    throw new Error('NEXT_PUBLIC_SITE_URL is not set. Password reset links and email URLs will be broken.')
  }
  return configuredUrl.replace(/\/$/, '')
}

const transporter = nodemailer.createTransport({
  host: 'smtp.purelymail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.PURELYMAIL_SMTP_USER,
    pass: process.env.PURELYMAIL_SMTP_PASS,
  },
})

/**
 * Send an email via PurelyMail SMTP.
 */
export async function sendEmail({ to, subject, html }: EmailPayload) {
  const from = process.env.EMAIL_FROM || 'noreply@totaldsgn.com'

  try {
    await transporter.sendMail({ from, to, subject, html })
    return { success: true }
  } catch (err) {
    console.error('Email send error:', err)
    return { success: false, error: String(err) }
  }
}

/**
 * Send new ticket notification to admin.
 */
export async function notifyAdminNewTicket(ticketTitle: string, clientEmail: string) {
  const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()).filter(Boolean) || []
  if (!adminEmails.length) return

  const siteUrl = getSiteUrl()
  const safeTitle = escapeHtml(sanitizeForHeader(ticketTitle))
  const safeClientEmail = escapeHtml(sanitizeForHeader(clientEmail))

  for (const email of adminEmails) {
    await sendEmail({
      to: email,
      subject: `New Support Ticket: ${sanitizeForHeader(ticketTitle)}`,
      html: `
        <p>A new support ticket has been submitted by <strong>${safeClientEmail}</strong>.</p>
        <p><strong>Subject:</strong> ${safeTitle}</p>
        <p><a href="${siteUrl}/admin">View in Admin Panel</a></p>
      `,
    })
  }
}

/**
 * Notify client that admin replied to their ticket.
 */
export async function notifyClientTicketUpdate(ticketTitle: string, clientEmail: string, status: string) {
  const siteUrl = getSiteUrl()
  const safeTitle = escapeHtml(sanitizeForHeader(ticketTitle))
  const safeStatus = escapeHtml(sanitizeForHeader(status.replace(/_/g, ' ')))
  const safeClientEmail = escapeHtml(sanitizeForHeader(clientEmail))

  await sendEmail({
    to: safeClientEmail,
    subject: `Ticket Updated: ${sanitizeForHeader(ticketTitle)}`,
    html: `
      <p>Your support ticket <strong>&quot;${safeTitle}&quot;</strong> has been updated.</p>
      <p><strong>Status:</strong> ${safeStatus}</p>
      <p><a href="${siteUrl}/dashboard">View in your Dashboard</a></p>
    `,
  })
}