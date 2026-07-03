# Simple Dashboard

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
| Deployment | Node.js server (xCloud, VPS, or any host) |

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

---

## Deployment

This project runs on any Node.js host. It currently deploys via **xCloud** with the following configuration:

| Setting | Value |
|---|---|
| Node version | 20.x or 22.x |
| Web root | `client-dashboard` |
| Build command | `npm run build` |
| Start command | `npm run start` |
| Port | 3003 (configurable) |

A root-level `package.json` acts as a deployment proxy, forwarding build and start commands into the `client-dashboard/` subdirectory.

The `.env` file can be set via xCloud's Environment field, or placed manually in `client-dashboard/.env` on the server.

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