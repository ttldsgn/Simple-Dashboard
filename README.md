# Simple Dashboard

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/ttldsgn/Simple-Dashboard/releases)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-blue?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-GPL--2.0-green.svg)](LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-FF8F3F?logo=buy-me-a-coffee)](https://buymeacoffee.com/totaldsgn)

An open-source client portal built with **Next.js**, **Supabase**, **Umami Analytics**, and **Uptime Kuma**. Gives clients a self-service dashboard to view website analytics, monitor uptime, submit support tickets, and access invoices — all in one place.

---

## Features

### Analytics Dashboard
- Real-time pageview and visitor statistics pulled from Umami
- Interactive charts (bar chart with Recharts) showing page views and sessions
- Bounce rate, total visitors, and pageview counters
- Auto-refreshes every 5 minutes via client-side API polling
- Deep link to full Umami analytics dashboard

### Uptime Monitoring
- Live status badges from Uptime Kuma (embedded via image tags)
- Monitor list showing individual service status
- Per-client configuration — each client can have their own Kuma status page slug

### Support Desk
- Clients create tickets with subject, description, and optional screenshots (2MB max)
- Full conversation view with message threading
- Admin replies shown in distinct styling
- Ticket statuses: Open → In Progress → Resolved → Closed
- Auto-cleanup of closed tickets after 30 days
- Email notifications for new tickets and status updates

### Invoices
- Invoice list with date, description, amount, and payment status
- Paid / Open status badges
- Direct links to Zoho invoices for payment
- Admin panel for uploading and managing invoices

### Admin Panel
- View any client's dashboard by their client ID
- Manage all tickets (reply, update status, bulk delete)
- Upload and manage invoices for any client
- Session secret rotation

### Authentication & Security
- Supabase Auth with magic link login
- Password reset flow with session validation
- 30-minute auto-logout for inactivity
- Row-Level Security (RLS) enforced via Supabase
- Server-side session verification via middleware

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Authentication | Supabase Auth |
| Database | Supabase (PostgreSQL) |
| Analytics | Umami |
| Uptime | Uptime Kuma |
| Charts | Recharts |
| Styling | Tailwind CSS 4 |
| Email | Nodemailer (SMTP) |
| Deployment | Node.js server (VPS or any host) |

---

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- A Supabase project (free tier works)
- Umami Analytics instance (self-hosted or cloud)
- Uptime Kuma instance (optional — for uptime monitoring)
- SMTP server for email notifications

### Local Development

```bash
# Clone the repository
git clone https://github.com/ttldsgn/Simple-Dashboard.git
cd Simple-Dashboard/client-dashboard

# Install dependencies
npm install

# Copy the example env file and fill in your values
cp .env.example .env.local

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Environment Variables

Copy `client-dashboard/.env.example` to `.env.local` and configure:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/publishable key |
| `NEXT_PUBLIC_SITE_URL` | Public URL of your dashboard (e.g., `https://dashboard.yourdomain.com`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only, never exposed to client) |
| `UMAMI_API_URL` | Base URL of your Umami instance |
| `UMAMI_AUTH_TOKEN` | Umami API auth token for stats queries |
| `KUMA_API_URL` | Base URL of your Uptime Kuma instance |
| `PURELYMAIL_SMTP_USER` | SMTP username for email notifications |
| `PURELYMAIL_SMTP_PASS` | SMTP password |
| `ADMIN_EMAIL` | Admin email for notifications |
| `EMAIL_FROM` | From address for outgoing emails |

> 💡 **Any SMTP provider works** — despite the `PURELYMAIL_` prefix in the variable names, these accept credentials from any SMTP service (SendGrid, Mailgun, Gmail SMTP, Zoho, AWS SES, etc.). The nodemailer transport is configured in `client-dashboard/utils/email.ts`.

---

## Deployment

This project runs on any Node.js host. The `client-dashboard/` subdirectory contains the Next.js app, while the root `package.json` acts as a deployment proxy that forwards build and start commands into the subdirectory.

| Setting | Value |
|---|---|
| Node version | 20.x or 22.x |
| Build command | `npm run build` |
| Start command | `npm run start` |
| Port | `3003` (configurable via `PORT` env var) |

Place your `.env` file in `client-dashboard/.env` on the server with all required environment variables.

---

## Supabase Setup

1. Create a [Supabase](https://supabase.com) project
2. Enable **Email Auth** with magic links
3. Add your production URL to **Authentication → URL Configuration → Redirect URLs**
4. Create a `profiles` table with columns: `id`, `company_name`, `role`, `umami_website_id`, `kuma_status_slug`, `kuma_badges`
5. Create `tickets` and `ticket_messages` tables
6. Create `invoices` table
7. Set up Row-Level Security policies as needed

---

## Customization

### Using different analytics or uptime providers

The data fetching is modular — edit these files:

- `client-dashboard/utils/umami.ts` — swap Umami for Plausible, Matomo, Google Analytics, etc.
- `client-dashboard/utils/kuma.ts` — swap Uptime Kuma for Betterstack, Statuspage, etc.

The dashboard components in `DashboardTabs.tsx` consume typed interfaces (`UmamiStats`, `KumaMonitor`), so updating the utils is all that's needed.

### Using a different email provider

The email transport is configured in `client-dashboard/utils/email.ts`. You can swap Purelymail for any SMTP service (SendGrid, Mailgun, Gmail SMTP, Zoho, AWS SES, etc.) by updating the host, port, and auth settings. The environment variable names (`PURELYMAIL_SMTP_USER`, `PURELYMAIL_SMTP_PASS`) can be renamed to match your provider if desired — just update the references in `email.ts`.

### Changing the port

Edit `PORT` in your `.env` file and update the start scripts in both `package.json` files.

---

## Project Structure

```
Simple-Dashboard/
├── package.json              # Root proxy for deployment
├── client-dashboard/
│   ├── app/
│   │   ├── admin/            # Admin panel
│   │   ├── api/              # API routes (analytics polling)
│   │   ├── auth/             # Auth pages (callback, update-password)
│   │   ├── dashboard/        # Client dashboard (page, actions, tabs)
│   │   └── layout.tsx        # Root layout & metadata
│   ├── hooks/                # React hooks (useAutoLogout)
│   ├── src/                  # Middleware
│   ├── utils/
│   │   ├── supabase/         # Supabase clients (client, server, admin, middleware)
│   │   ├── umami.ts          # Umami API integration
│   │   ├── kuma.ts           # Uptime Kuma API integration
│   │   └── email.ts          # Email notification helpers
│   └── public/               # Static assets
```

---

## License

This project is licensed under the **GNU General Public License v2.0** — see the [LICENSE](LICENSE) file for details.

You are free to clone, modify, and distribute this project. Attribution is appreciated but not required.

---

## Author

Built by [Total Design](https://totaldsgn.com). Questions? Open an issue or submit a pull request.