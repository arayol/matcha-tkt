-- Matcha On Ice - Database Schema
-- This file is for reference only. Use `npm run db:push` to create tables automatically.
-- Generated from shared/schema.ts

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  event_type TEXT NOT NULL,
  location TEXT DEFAULT 'San Diego, CA',
  capacity INTEGER,
  price_in_cents INTEGER,
  stripe_product_id TEXT UNIQUE,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR NOT NULL,
  purchaser_name TEXT NOT NULL,
  purchaser_email TEXT NOT NULL,
  ticket_type TEXT NOT NULL,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  qr_code TEXT,
  qr_data TEXT UNIQUE,
  ticket_url TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'valid',
  issued_by TEXT,
  reconciliation_status TEXT,
  purchased_at TIMESTAMP DEFAULT NOW(),
  used_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS csv_uploads (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS hostinger_orders (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id VARCHAR NOT NULL,
  order_number TEXT NOT NULL,
  email TEXT,
  billing_name TEXT,
  phone TEXT,
  order_status TEXT,
  created_at TEXT,
  product_raw TEXT,
  parsed_event_date TEXT,
  parsed_event_time TEXT,
  parsed_event_type TEXT,
  parsed_ticket_type TEXT,
  parsed_class_name TEXT,
  skus TEXT,
  price TEXT,
  quantity INTEGER,
  currency TEXT,
  subtotal TEXT,
  shipping TEXT,
  taxes TEXT,
  discount_code TEXT,
  discount_amount TEXT,
  gift_card TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  postal TEXT,
  payment_method TEXT,
  notes TEXT,
  order_type TEXT NOT NULL DEFAULT 'ticket',
  reconciliation_status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  postal TEXT,
  events_attended TEXT[],
  ticket_types TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_date_names (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
