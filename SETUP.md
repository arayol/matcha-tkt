# Matcha On Ice - Setup Guide

## Quick Start on a New Replit Account

### 1. Import the Project
- Download the ZIP from GitHub
- Create a new Replit project and upload the files, OR use "Import from GitHub" in Replit

### 2. Configure Replit Modules
Ensure these modules are enabled in `.replit`:
- `nodejs-20`
- `web`
- `postgresql-16`

If `.replit` is not imported, create it with:
```
modules = ["nodejs-20", "web", "postgresql-16"]
run = "npm run dev"

[nix]
channel = "stable-24_05"

[[ports]]
localPort = 5000
externalPort = 80

[env]
PORT = "5000"

[deployment]
deploymentTarget = "autoscale"
run = ["node", "./dist/index.cjs"]
build = ["npm", "run", "build"]
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Provision Database
Replit provides PostgreSQL automatically. Once the database is provisioned, the `DATABASE_URL` environment variable will be set automatically.

### 5. Push Database Schema
```bash
npm run db:push
```
This uses Drizzle Kit to create all tables from `shared/schema.ts`.

### 6. Set Environment Variables (Secrets)
Set these in Replit's "Secrets" tab:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string (auto-set by Replit DB) | Auto |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` or `sk_live_...`) | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_...`) | Yes |
| `SESSION_SECRET` | Any random string for express-session | Yes |

### 7. Install Replit Integrations
These integrations must be installed from Replit's Integrations panel (not npm):

1. **JavaScript Database** (`javascript_database`) — Required for Replit PostgreSQL
2. **Google Mail** (`google-mail`) — Required for sending ticket emails via Gmail OAuth

To install:
- Go to the "Integrations" tab in your Replit project
- Search for each integration
- Click "Install" and follow the OAuth flow for Google Mail

### 8. Create Admin User
The app has no default admin user. On first run, you need to create one manually.

Connect to the database and run:
```sql
INSERT INTO users (id, username, password, role)
VALUES (
  gen_random_uuid(),
  'adm',
  '$2b$10$YOUR_BCRYPT_HASH_HERE',
  'adm'
);
```

Or use this Node.js script (run in Shell):
```bash
node -e "
const bcryptjs = require('bcryptjs');
const hash = bcryptjs.hashSync('your_password_here', 10);
console.log('INSERT INTO users (id, username, password, role) VALUES (gen_random_uuid(), \'adm\', \'' + hash + '\', \'adm\');');
"
```

Then execute the generated SQL in the database.

### 9. Configure Workflow
Create a workflow named "Start application" with command:
```
npm run dev
```

### 10. Run the App
```bash
npm run dev
```
The app will be available at port 5000.

---

## Database Schema

All tables are defined in `shared/schema.ts` and managed by Drizzle ORM. Running `npm run db:push` creates them automatically.

### Tables

#### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | varchar (PK) | UUID auto-generated |
| username | text | Unique |
| password | text | bcrypt hash |
| role | text | "adm" or "user" |

#### `events`
| Column | Type | Notes |
|--------|------|-------|
| id | varchar (PK) | UUID |
| name | text | Event name |
| date | text | e.g. "Feb 26th" |
| time | text | e.g. "6 PM" |
| event_type | text | e.g. "Members Event", "Event Ticket" |
| location | text | Default: "San Diego, CA" |
| capacity | integer | Nullable |
| price_in_cents | integer | Nullable |
| stripe_product_id | text | Unique, nullable |
| active | boolean | Default: true |

#### `tickets`
| Column | Type | Notes |
|--------|------|-------|
| id | varchar (PK) | UUID |
| event_id | varchar | FK to events |
| purchaser_name | text | |
| purchaser_email | text | |
| ticket_type | text | e.g. "General Admission", "Members Event Ticket" |
| stripe_session_id | text | Null for courtesy/reconciled tickets |
| stripe_payment_intent_id | text | Nullable |
| qr_code | text | Base64 QR image |
| qr_data | text | Unique, format: MOI-UUID-HASH |
| ticket_url | text | Unique, random hex slug |
| status | text | "valid", "used", "cancelled" |
| issued_by | text | Username or null |
| reconciliation_status | text | Nullable |
| purchased_at | timestamp | Auto |
| used_at | timestamp | Nullable |

#### `csv_uploads`
| Column | Type | Notes |
|--------|------|-------|
| id | varchar (PK) | UUID |
| file_name | text | Original filename |
| uploaded_at | timestamp | Auto |
| uploaded_by | text | Username |
| record_count | integer | Number of records imported |
| status | text | "active" or "reverted" |

#### `hostinger_orders`
| Column | Type | Notes |
|--------|------|-------|
| id | varchar (PK) | UUID |
| import_id | varchar | FK to csv_uploads |
| order_number | text | e.g. "#2147" |
| email | text | Nullable |
| billing_name | text | Nullable |
| phone | text | Nullable |
| order_status | text | e.g. "Fulfilled" |
| created_at | text | Order date string |
| product_raw | text | Original product field |
| parsed_event_date | text | e.g. "Feb 26th" |
| parsed_event_time | text | e.g. "6 PM" |
| parsed_event_type | text | e.g. "Members Event", "Event Ticket" |
| parsed_ticket_type | text | e.g. "Members Event Ticket", "General Admission Ticket" |
| parsed_class_name | text | e.g. "Full Body Sculpt Class: Paulina" |
| skus | text | |
| price | text | |
| quantity | integer | |
| currency | text | |
| subtotal | text | |
| shipping | text | |
| taxes | text | |
| discount_code | text | |
| discount_amount | text | |
| gift_card | text | |
| street_address | text | |
| city | text | |
| state | text | |
| postal | text | |
| payment_method | text | |
| notes | text | |
| order_type | text | "ticket" or "vendor" |
| reconciliation_status | text | "pending", "reconciled", "deleted" |

#### `customers`
| Column | Type | Notes |
|--------|------|-------|
| id | varchar (PK) | UUID |
| name | text | |
| email | text | Unique |
| phone | text | Nullable |
| street_address | text | |
| city | text | |
| state | text | |
| postal | text | |
| events_attended | text[] | Array |
| ticket_types | text[] | Array |
| created_at | timestamp | Auto |
| updated_at | timestamp | Auto |

#### `event_date_names`
| Column | Type | Notes |
|--------|------|-------|
| id | varchar (PK) | UUID |
| event_date | text | Unique, e.g. "Feb 26th" |
| event_name | text | e.g. "Matcha On Ice Valentine's Day" |
| created_at | timestamp | Auto |

---

## Stripe Webhook Setup

1. In your Stripe Dashboard, go to Developers > Webhooks
2. Add endpoint: `https://YOUR-REPLIT-URL.replit.app/api/stripe/webhook`
3. Select event: `checkout.session.completed`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

### Stripe Product Naming Convention
Products in Stripe should follow this format:
```
[Date], [Time] - [Type] Event Ticket
```
Examples:
- `Feb 26th, 6 PM - Members Event Ticket`
- `Mar 15th, 10 AM - General Admission Event Ticket`

---

## Project Structure

```
├── client/                  # Frontend (React + Vite)
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx          # Router + auth
│   │   ├── lib/
│   │   │   ├── auth.ts      # useAuth hook
│   │   │   └── queryClient.ts
│   │   ├── components/
│   │   │   ├── AppLayout.tsx # Shared layout (sidebar + drawer)
│   │   │   └── ui/          # shadcn components
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── TicketPage.tsx
│   │   │   ├── TicketsPage.tsx
│   │   │   ├── CourtesyPage.tsx
│   │   │   ├── ScannerPage.tsx
│   │   │   ├── AdminUsersPage.tsx
│   │   │   ├── CsvImportPage.tsx
│   │   │   ├── ReconciliationPage.tsx
│   │   │   └── EventComparisonPage.tsx
│   │   └── hooks/
│   └── public/
│       ├── manifest.json    # PWA manifest
│       └── sw.js            # Service worker
├── server/                  # Backend (Express)
│   ├── index.ts             # Entry point, session, passport
│   ├── routes.ts            # All API routes
│   ├── storage.ts           # Database CRUD (IStorage interface)
│   ├── db.ts                # PostgreSQL connection
│   ├── csvParser.ts         # Hostinger CSV parsing
│   ├── stripeClient.ts      # Stripe client
│   ├── webhookHandlers.ts   # Webhook processing
│   ├── qrcode.ts            # QR code generation
│   ├── pdfGenerator.ts      # PDF ticket generation (pdfkit)
│   ├── emailService.ts      # Gmail OAuth email
│   ├── vite.ts              # Vite dev server integration
│   └── matcha-logo.png      # Logo for email CID
├── shared/
│   └── schema.ts            # Drizzle schema (source of truth)
├── drizzle.config.ts
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
├── package.json
└── .replit
```

---

## Key Notes for Continuing Development

### Auth Roles
- `adm` — Full admin access (all pages)
- `user` — Scanner + courtesy only (`/scan`, `/courtesy`)

### CSS Theme
- Primary color: purple (hsl 250 72% 64%)
- Cards: rounded-3xl with shadow-card
- Sidebar: 88px icon-only on desktop, hamburger drawer on mobile
- Dark mode supported (class-based toggle)
- Fonts: Inter/DM Sans (sans), JetBrains Mono (mono)

### UI Language
- All UI text must be in **English (US)**

### CSV Import Source
- CSV files come from Hostinger store exports
- Product Names format: `Date, Time EventType - TicketDetails`
- Parser extracts: eventDate, eventTime, eventType, ticketType, className

### Reconciliation Flow
1. Upload CSV on `/admin/csv-import`
2. Go to `/admin/reconciliation` to compare CSV vs Stripe
3. "Missing in Stripe" = customer bought on Hostinger but no Stripe webhook
4. "Missing in CSV" = Stripe ticket exists but no matching CSV order
5. Mark as Reconciled or Delete divergences
6. For CSV-only orders: option to generate tickets + send email invitations

### Data Priority
- Hostinger CSV has priority over Stripe data for reconciliation
- Events are identified by date text (e.g., "Feb 15th")
- Admin can assign custom event names via Event Names by Date section
