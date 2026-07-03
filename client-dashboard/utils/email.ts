'use server'

import nodemailer from 'nodemailer'

interface EmailPayload {
  to: string
  subject: string
  html: string
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
export async function notifyAdminNewTicket(ticketTitle: string, clientEmail: string, ticketId: string) {
  const adminEmails = process.env.ADMIN_EMAIL?.split(',').map(e => e.trim()).filter(Boolean) || []
  if (!adminEmails.length) return

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  for (const email of adminEmails) {
    await sendEmail({
      to: email,
      subject: `New Support Ticket: ${ticketTitle}`,
      html: `
        <p>A new support ticket has been submitted by <strong>${clientEmail}</strong>.</p>
        <p><strong>Subject:</strong> ${ticketTitle}</p>
        <p><a href="${siteUrl}/admin">View in Admin Panel</a></p>
      `,
    })
  }
}

/**
 * Notify client that admin replied to their ticket.
 */
export async function notifyClientTicketUpdate(ticketTitle: string, clientEmail: string, status: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const statusLabel = status.replace('_', ' ')

  await sendEmail({
    to: clientEmail,
    subject: `Ticket Updated: ${ticketTitle}`,
    html: `
      <p>Your support ticket <strong>"${ticketTitle}"</strong> has been updated.</p>
      <p><strong>Status:</strong> ${statusLabel}</p>
      <p><a href="${siteUrl}/dashboard">View in your Dashboard</a></p>
    `,
  })
}