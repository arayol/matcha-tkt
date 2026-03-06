# Matcha On Ice - Ticket Management System

## About
Ticket management system for fitness events in San Diego, CA. Includes Stripe integration for automated sales, QR codes, unique ticket URLs, admin dashboard, and courtesy ticket generation.

## Status: Marco M1 - Backend Core ✅
- Database schema: events + tickets tables in PostgreSQL
- QR code generation (server-side via `qrcode` package)
- Webhook handler creates tickets from `checkout.session.completed`
- API routes for tickets, events, validation, courtesy tickets
- Public ticket page with QR code display
- Dashboard with live data from API

## Architecture
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + wouter (routing) + TanStack Query
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL (Replit) + Drizzle ORM
- **Stripe:** stripe-replit-sync for migrations/sync + direct signature verification for webhooks
- **QR Codes:** `qrcode` package (server-side PNG generation as base64)

## Important Files
- `server/index.ts` — Main server, webhook POST `/api/stripe/webhook` (before express.json())
- `server/stripeClient.ts` — Stripe client using `STRIPE_SECRET_KEY` env var
- `server/webhookHandlers.ts` — Webhook processing, creates tickets on checkout.session.completed
- `server/routes.ts` — API routes (events, tickets, validation, courtesy, stats)
- `server/qrcode.ts` — QR code generation utility
- `server/storage.ts` — DatabaseStorage with full CRUD for events/tickets
- `server/db.ts` — PostgreSQL connection via drizzle-orm
- `shared/schema.ts` — Database schema (users, events, tickets)
- `client/src/App.tsx` — Router (Dashboard + TicketPage)
- `client/src/pages/Dashboard.tsx` — Admin dashboard with live data
- `client/src/pages/TicketPage.tsx` — Public ticket display with QR code
- `client/src/index.css` — CSS variables (lilac/blue/yellow palette)
- `tailwind.config.ts` — Extended with shadow-card, shadow-soft, rounded-3xl

## API Endpoints
- `GET /api/health` — System status
- `GET /api/stats` — Dashboard stats (total/valid/used tickets, total events)
- `GET /api/events` — List all events
- `GET /api/tickets` — List all tickets (admin)
- `GET /api/tickets/:id` — Get ticket by ID
- `GET /api/ticket/:urlSlug` — Get ticket by URL slug (public)
- `POST /api/tickets/:id/validate` — Mark ticket as used
- `POST /api/tickets/validate-qr` — Validate by QR data
- `POST /api/tickets/courtesy` — Create courtesy ticket

## Secrets Required
- `STRIPE_SECRET_KEY` — Stripe secret key (sk_test_... or sk_live_...)
- `STRIPE_WEBHOOK_SECRET` — Webhook signing secret (whsec_...)
- `DATABASE_URL` — PostgreSQL connection (auto-managed by Replit)
- `SESSION_SECRET` — Session secret

## Stripe Product Naming Convention
Format: `[Date], [Time] - [Type] Event Ticket`
Example: `Feb 26th, 6 PM - Members Event Ticket`
Types: Members, General, VIP

## User Preferences
- All app UI text, labels, and content must be in **English (US)**.

## CSS Theme
- Palette: lilac/blue/yellow soft (modern dashboard style)
- Primary: purple (hsl 250 72% 64%)
- Charts: purple, light blue, yellow, soft orange, dark blue
- Cards: rounded-3xl, shadow-card, border-card-border
- Sidebar: 88px, centered icons, rounded-[32px]
- Layout: 3-column grid (sidebar + main + right panel)
- Fonts: Inter / DM Sans (sans), JetBrains Mono (mono)
- Dark mode supported
