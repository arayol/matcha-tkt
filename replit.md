# Matcha On Ice - Ticket Management System

## About
Ticket management system for fitness events in San Diego, CA. Includes Stripe integration for automated sales, QR codes, unique ticket URLs, admin dashboard, courtesy ticket generation, and Gmail OAuth email delivery.

## Status: Marco M6 - Scanner Overhaul ✅
- **M6 complete:** Full mobile scanner app redesign
  - Fixed camera bug (html5-qrcode element always in DOM, visibility toggled via CSS)
  - 3-tab scanner UI: Scanner / Activity (scan history) / Guests (searchable guest list)
  - Dark mode toggle (default dark, persisted in localStorage)
  - Real-time progress bar: "X / Y checked in" with remaining count
  - Scan history: last 20 scans with name, type, relative timestamps
  - Guest list: searchable, filterable (All/Pending/Arrived), status badges
  - New API: `GET /api/scanner/stats` (totalTickets, checkedIn, remaining, recentScans, guestList)
  - PWA: service worker (`sw.js`), offline caching, proper icons (192x192, 512x512)
  - iPhone home screen: apple-touch-icon, splash screen, black-translucent status bar
  - Matcha green accent (#7a9956) for scanner UI

## Previous Milestones
- **M5:** Gmail OAuth email with PDF attachment (CID logo, black header/footer)
- **M4:** Admin dashboard with courtesy form, sales report, ticket filter tabs
- **M3:** PDF ticket download, Share button (Web Share API + clipboard)
- **M2:** PWA scanner at `/scan`, camera QR validation, haptic feedback
- **M1:** DB schema, QR codes, webhooks, API routes, ticket page, dashboard

## Architecture
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + wouter (routing) + TanStack Query
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL (Replit) + Drizzle ORM
- **Stripe:** stripe-replit-sync for migrations/sync + direct signature verification for webhooks
- **QR Codes:** `qrcode` package (server-side PNG generation as base64)
- **Email:** Gmail OAuth via Replit connector (gmail.send scope)
- **PWA:** Service worker + manifest + Apple touch icons

## Important Files
- `server/index.ts` — Main server, webhook POST `/api/stripe/webhook` (before express.json())
- `server/stripeClient.ts` — Stripe client using `STRIPE_SECRET_KEY` env var
- `server/webhookHandlers.ts` — Webhook processing, creates tickets on checkout.session.completed
- `server/routes.ts` — API routes (events, tickets, validation, courtesy, stats, scanner/stats)
- `server/qrcode.ts` — QR code generation utility
- `server/pdfGenerator.ts` — PDF ticket generation via pdfkit (with QR code embedded)
- `server/emailService.ts` — Gmail OAuth email (CID logo, black header/footer, PDF attachment)
- `server/matcha-logo.png` — Transparent-bg PNG logo (CID attachment in emails)
- `server/storage.ts` — DatabaseStorage with full CRUD for events/tickets
- `server/db.ts` — PostgreSQL connection via drizzle-orm
- `shared/schema.ts` — Database schema (users, events, tickets)
- `client/src/App.tsx` — Router (Dashboard + TicketPage + ScannerPage)
- `client/src/pages/Dashboard.tsx` — Admin dashboard with live data + Scanner nav link
- `client/src/pages/TicketPage.tsx` — Public ticket display with QR code
- `client/src/pages/ScannerPage.tsx` — PWA mobile scanner (3 tabs, dark mode, live stats)
- `client/public/manifest.json` — PWA manifest (start_url: /scan, standalone, portrait)
- `client/public/sw.js` — Service worker for offline caching
- `client/public/icon-192.png` — PWA icon 192x192
- `client/public/icon-512.png` — PWA icon 512x512
- `client/index.html` — PWA meta tags (apple-touch-icon, splash, theme-color)
- `client/src/index.css` — CSS variables (lilac/blue/yellow palette)
- `tailwind.config.ts` — Extended with shadow-card, shadow-soft, rounded-3xl

## API Endpoints
- `GET /api/health` — System status
- `GET /api/stats` — Dashboard stats (total/valid/used tickets, revenue, byType)
- `GET /api/scanner/stats` — Scanner stats (totalTickets, checkedIn, remaining, recentScans, guestList)
- `GET /api/events` — List all events
- `GET /api/tickets` — List all tickets (admin)
- `GET /api/tickets/:id` — Get ticket by ID
- `GET /api/ticket/:urlSlug` — Get ticket by URL slug (public)
- `GET /api/ticket/:urlSlug/pdf` — Download ticket PDF
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
- Scanner accent: Matcha green (#7a9956)
- Charts: purple, light blue, yellow, soft orange, dark blue
- Cards: rounded-3xl, shadow-card, border-card-border
- Sidebar: 88px, centered icons, rounded-[32px]
- Layout: 3-column grid (sidebar + main + right panel)
- Fonts: Inter / DM Sans (sans), JetBrains Mono (mono)
- Dark mode supported (scanner defaults to dark)
