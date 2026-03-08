# Matcha On Ice - Ticket Management System

## About
Ticket management system for fitness events in San Diego, CA. Includes Stripe integration for automated sales, QR codes, unique ticket URLs, admin dashboard, courtesy ticket generation, Gmail OAuth email delivery, and CSV reconciliation with Hostinger store exports.

## Status: M9 — CSV Reconciliation + Event Comparison
- **CSV Import:** Admin-only page to upload Hostinger CSV exports, parse Product field, detect duplicates, store in separate `hostinger_orders` table
- **Reconciliation:** Compare CSV orders against Stripe tickets, show divergences with badges, bulk/individual edit, export to CSV
- **Event Comparison:** Comparative dashboard with charts (recharts) and tables showing tickets by type, revenue, vendors, occupancy across events
- **Customer base:** Customers table built from CSV data (name, email, phone, address, events attended, ticket types) for future email campaigns
- **Upload history:** Track all CSV imports with revert capability

## Previous Milestones
- **M8+:** Scanner purple buttons, issuer badge, "M" logo removed
- **M8:** Shared AppLayout, unified navigation, scanner restyled
- **M7:** Authentication system + dashboard mobile redesign
- **M6:** Full mobile scanner app redesign (3-tab UI, dark mode, live stats, guest list, PWA)
- **M5:** Gmail OAuth email with PDF attachment (CID logo, black header/footer)
- **M4:** Admin dashboard with courtesy form, sales report, ticket filter tabs
- **M3:** PDF ticket download, Share button (Web Share API + clipboard)
- **M2:** PWA scanner at `/scan`, camera QR validation, haptic feedback
- **M1:** DB schema, QR codes, webhooks, API routes, ticket page, dashboard

## Architecture
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui + wouter (routing) + TanStack Query + Recharts
- **Backend:** Express.js + TypeScript + express-session + passport-local + multer (file uploads)
- **Database:** PostgreSQL (Replit) + Drizzle ORM
- **Auth:** Session-based with passport-local, role field on users table (`adm` or `user`)
- **Stripe:** stripe-replit-sync for migrations/sync + direct signature verification for webhooks
- **QR Codes:** `qrcode` package (server-side PNG generation as base64)
- **Email:** Gmail OAuth via Replit connector (gmail.send scope)
- **PWA:** Service worker + manifest + Apple touch icons
- **CSV Parsing:** csv-parse for Hostinger CSV imports

## Important Files
- `server/index.ts` — Main server, session/passport setup, webhook POST `/api/stripe/webhook` (before express.json())
- `server/routes.ts` — API routes + auth endpoints + requireAuth/requireAdmin middleware + CSV/reconciliation/comparison routes
- `server/storage.ts` — DatabaseStorage with full CRUD for events/tickets/users/csvUploads/hostingerOrders/customers
- `server/csvParser.ts` — CSV parsing, Product field parser, duplicate detection
- `server/db.ts` — PostgreSQL connection via drizzle-orm
- `server/stripeClient.ts` — Stripe client using `STRIPE_SECRET_KEY` env var
- `server/webhookHandlers.ts` — Webhook processing, creates tickets on checkout.session.completed
- `server/qrcode.ts` — QR code generation utility
- `server/pdfGenerator.ts` — PDF ticket generation via pdfkit (with QR code embedded)
- `server/emailService.ts` — Gmail OAuth email (CID logo, black header/footer, PDF attachment)
- `server/matcha-logo.png` — Transparent-bg PNG logo (CID attachment in emails)
- `shared/schema.ts` — Database schema (users, events, tickets, csv_uploads, hostinger_orders, customers)
- `client/src/components/AppLayout.tsx` — Shared layout with sidebar (desktop) + hamburger drawer (mobile)
- `client/src/App.tsx` — Router with auth check, role-based route protection
- `client/src/lib/auth.ts` — useAuth hook (login, logout, session check)
- `client/src/pages/LoginPage.tsx` — Login form page
- `client/src/pages/Dashboard.tsx` — Admin dashboard with hamburger menu, stat cards, courtesy form
- `client/src/pages/TicketPage.tsx` — Public ticket display with QR code
- `client/src/pages/TicketsPage.tsx` — Full ticket list with search and filter tabs
- `client/src/pages/CourtesyPage.tsx` — Mobile-optimized courtesy ticket form
- `client/src/pages/AdminUsersPage.tsx` — User management (create, delete, role change)
- `client/src/pages/ScannerPage.tsx` — PWA mobile scanner (3 tabs, dark mode, live stats)
- `client/src/pages/CsvImportPage.tsx` — CSV upload, preview, import, history with revert
- `client/src/pages/ReconciliationPage.tsx` — CSV × Stripe reconciliation with filters, badges, bulk actions
- `client/src/pages/EventComparisonPage.tsx` — Comparative dashboard with charts and tables
- `client/public/manifest.json` — PWA manifest (start_url: /scan, standalone, portrait)
- `client/public/sw.js` — Service worker for offline caching

## Database Tables
- `users` — id, username, password, role
- `events` — id, name, date, time, event_type, location, capacity, price_in_cents, stripe_product_id, active
- `tickets` — id, event_id, purchaser_name, purchaser_email, ticket_type, stripe_session_id, stripe_payment_intent_id, qr_code, qr_data, ticket_url, status, issued_by, reconciliation_status, purchased_at, used_at
- `csv_uploads` — id, file_name, uploaded_at, uploaded_by, record_count, status (active/reverted)
- `hostinger_orders` — id, import_id, order_number, email, billing_name, phone, order_status, created_at, product_raw, parsed_event_date, parsed_event_time, parsed_ticket_type, parsed_class_name, skus, price, quantity, currency, subtotal, shipping, taxes, discount_code, discount_amount, gift_card, street_address, city, state, postal, payment_method, notes, order_type (ticket/vendor), reconciliation_status
- `customers` — id, name, email, phone, street_address, city, state, postal, events_attended[], ticket_types[], created_at, updated_at

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
- `POST /api/admin/csv/upload` — Upload and import CSV (multipart/form-data)
- `GET /api/admin/csv/uploads` — List upload history
- `POST /api/admin/csv/uploads/:id/revert` — Revert an import (delete its orders)
- `GET /api/admin/csv/orders` — List all hostinger orders
- `GET /api/admin/reconciliation` — Compare CSV vs Stripe, return divergences + summary
- `POST /api/admin/reconciliation/apply` — Batch reconcile/delete records
- `PATCH /api/admin/reconciliation/:id` — Edit individual order record
- `GET /api/admin/reconciliation/export` — Export divergences as CSV file
- `GET /api/admin/events/comparison` — Aggregated event comparison metrics

## Auth Roles
- `adm` — Full access: dashboard, tickets, courtesy, scanner, user management, CSV import, reconciliation, event comparison
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

## Hostinger CSV Product Field Parsing
The Product field from Hostinger CSV concatenates: event name + date + time + ticket type + class name
Parser extracts: parsedEventDate, parsedEventTime, parsedTicketType, parsedClassName, orderType (ticket/vendor)

## User Preferences
- All app UI text, labels, and content must be in **English (US)**.

## CSS Theme
- Palette: lilac/blue/yellow soft (modern dashboard style)
- Primary: purple (hsl 250 72% 64%)
- Scanner accent: Primary purple (progress bar only retains matcha green #7a9956)
- Cards: rounded-3xl, shadow-card, border-card-border
- Sidebar: 88px, centered icons, rounded-[32px] (desktop only, hidden on mobile)
- Mobile: hamburger menu + slide-out drawer
- Layout: 3-column grid (sidebar + main + right panel) on desktop
- Fonts: Inter / DM Sans (sans), JetBrains Mono (mono)
- Dark mode supported (scanner defaults to dark, toggle in sidebar/header)
