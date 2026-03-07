# Matcha On Ice - Ticket Management System

## About
Ticket management system for fitness events in San Diego, CA. Includes Stripe integration for automated sales, QR codes, unique ticket URLs, admin dashboard, courtesy ticket generation, and Gmail OAuth email delivery.

## Status: Marco M7 - Auth + Mobile Dashboard
- **M7 complete:** Authentication system + dashboard mobile redesign
  - Role-based auth: `adm` (full access) and `user` (scanner + courtesy only)
  - Login page with username/password, show/hide password, error handling
  - Express-session + passport-local auth with session persistence
  - Default admin seed: `adm` / `adm99`
  - Dashboard hamburger menu (mobile) with slide-out drawer
  - Dark mode toggle on both desktop sidebar and mobile header
  - Reorganized stat cards: Total Tickets, Valid/Used, General Admission, Members
  - Removed Revenue and Events stat cards from dashboard
  - Separate Tickets page (`/tickets`) with search, filter tabs (All/Valid/Used/Courtesy/Cancelled)
  - Separate Courtesy page (`/courtesy`) with mobile-optimized form
  - Admin User Management page (`/admin/users`) — create, delete, change roles
  - Courtesy ticket bug fixed (sends purchaserName/purchaserEmail correctly)
  - All API routes protected with requireAuth/requireAdmin middleware

## Previous Milestones
- **M6:** Full mobile scanner app redesign (3-tab UI, dark mode, live stats, guest list, PWA)
- **M5:** Gmail OAuth email with PDF attachment (CID logo, black header/footer)
- **M4:** Admin dashboard with courtesy form, sales report, ticket filter tabs
- **M3:** PDF ticket download, Share button (Web Share API + clipboard)
- **M2:** PWA scanner at `/scan`, camera QR validation, haptic feedback
- **M1:** DB schema, QR codes, webhooks, API routes, ticket page, dashboard

## Architecture
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + wouter (routing) + TanStack Query
- **Backend:** Express.js + TypeScript + express-session + passport-local
- **Database:** PostgreSQL (Replit) + Drizzle ORM
- **Auth:** Session-based with passport-local, role field on users table (`adm` or `user`)
- **Stripe:** stripe-replit-sync for migrations/sync + direct signature verification for webhooks
- **QR Codes:** `qrcode` package (server-side PNG generation as base64)
- **Email:** Gmail OAuth via Replit connector (gmail.send scope)
- **PWA:** Service worker + manifest + Apple touch icons

## Important Files
- `server/index.ts` — Main server, session/passport setup, webhook POST `/api/stripe/webhook` (before express.json())
- `server/routes.ts` — API routes + auth endpoints + requireAuth/requireAdmin middleware
- `server/storage.ts` — DatabaseStorage with full CRUD for events/tickets/users
- `server/db.ts` — PostgreSQL connection via drizzle-orm
- `server/stripeClient.ts` — Stripe client using `STRIPE_SECRET_KEY` env var
- `server/webhookHandlers.ts` — Webhook processing, creates tickets on checkout.session.completed
- `server/qrcode.ts` — QR code generation utility
- `server/pdfGenerator.ts` — PDF ticket generation via pdfkit (with QR code embedded)
- `server/emailService.ts` — Gmail OAuth email (CID logo, black header/footer, PDF attachment)
- `server/matcha-logo.png` — Transparent-bg PNG logo (CID attachment in emails)
- `shared/schema.ts` — Database schema (users with role field, events, tickets)
- `client/src/App.tsx` — Router with auth check, role-based route protection
- `client/src/lib/auth.ts` — useAuth hook (login, logout, session check)
- `client/src/pages/LoginPage.tsx` — Login form page
- `client/src/pages/Dashboard.tsx` — Admin dashboard with hamburger menu, stat cards, courtesy form
- `client/src/pages/TicketPage.tsx` — Public ticket display with QR code
- `client/src/pages/TicketsPage.tsx` — Full ticket list with search and filter tabs
- `client/src/pages/CourtesyPage.tsx` — Mobile-optimized courtesy ticket form
- `client/src/pages/AdminUsersPage.tsx` — User management (create, delete, role change)
- `client/src/pages/ScannerPage.tsx` — PWA mobile scanner (3 tabs, dark mode, live stats)
- `client/public/manifest.json` — PWA manifest (start_url: /scan, standalone, portrait)
- `client/public/sw.js` — Service worker for offline caching

## API Endpoints
### Public (no auth)
- `GET /api/health` — System status
- `POST /api/stripe/webhook` — Stripe webhook handler
- `GET /api/ticket/:urlSlug` — Get ticket by URL slug (public ticket page)
- `GET /api/ticket/:urlSlug/pdf` — Download ticket PDF

### Auth
- `POST /api/auth/login` — Login with username/password
- `POST /api/auth/logout` — Destroy session
- `GET /api/auth/me` — Current user info

### Protected (requireAuth)
- `GET /api/stats` — Dashboard stats (total/valid/used tickets, revenue, byType)
- `GET /api/scanner/stats` — Scanner stats (totalTickets, checkedIn, remaining, recentScans, guestList)
- `GET /api/events` — List all events
- `GET /api/tickets` — List all tickets
- `GET /api/tickets/:id` — Get ticket by ID
- `POST /api/tickets/:id/validate` — Mark ticket as used
- `POST /api/tickets/validate-qr` — Validate by QR data
- `POST /api/tickets/courtesy` — Create courtesy ticket

### Admin Only (requireAdmin)
- `GET /api/admin/users` — List all users
- `POST /api/admin/users` — Create user
- `PATCH /api/admin/users/:id` — Update user role
- `DELETE /api/admin/users/:id` — Delete user

## Auth Roles
- `adm` — Full access: dashboard, tickets, courtesy, scanner, user management
- `user` — Limited: scanner (`/scan`) and courtesy (`/courtesy`) only

## Secrets Required
- `STRIPE_SECRET_KEY` — Stripe secret key (sk_test_... or sk_live_...)
- `STRIPE_WEBHOOK_SECRET` — Webhook signing secret (whsec_...)
- `DATABASE_URL` — PostgreSQL connection (auto-managed by Replit)
- `SESSION_SECRET` — Session secret for express-session

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
- Cards: rounded-3xl, shadow-card, border-card-border
- Sidebar: 88px, centered icons, rounded-[32px] (desktop only, hidden on mobile)
- Mobile: hamburger menu + slide-out drawer
- Layout: 3-column grid (sidebar + main + right panel) on desktop
- Fonts: Inter / DM Sans (sans), JetBrains Mono (mono)
- Dark mode supported (scanner defaults to dark, toggle in sidebar/header)
