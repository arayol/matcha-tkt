import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("user"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  eventType: text("event_type").notNull(),
  location: text("location").default("San Diego, CA"),
  capacity: integer("capacity"),
  priceInCents: integer("price_in_cents"),
  stripeProductId: text("stripe_product_id").unique(),
  active: boolean("active").default(true),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export const tickets = pgTable("tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  purchaserName: text("purchaser_name").notNull(),
  purchaserEmail: text("purchaser_email").notNull(),
  ticketType: text("ticket_type").notNull(),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  qrCode: text("qr_code"),
  qrData: text("qr_data").unique(),
  ticketUrl: text("ticket_url").unique(),
  status: text("status").notNull().default("valid"),
  issuedBy: text("issued_by"),
  reconciliationStatus: text("reconciliation_status"),
  purchasedAt: timestamp("purchased_at").defaultNow(),
  usedAt: timestamp("used_at"),
});

export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, purchasedAt: true, usedAt: true, reconciliationStatus: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof tickets.$inferSelect;

export const csvUploads = pgTable("csv_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  uploadedBy: text("uploaded_by").notNull(),
  recordCount: integer("record_count").notNull().default(0),
  status: text("status").notNull().default("active"),
});

export const insertCsvUploadSchema = createInsertSchema(csvUploads).omit({ id: true, uploadedAt: true });
export type InsertCsvUpload = z.infer<typeof insertCsvUploadSchema>;
export type CsvUpload = typeof csvUploads.$inferSelect;

export const hostingerOrders = pgTable("hostinger_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importId: varchar("import_id").notNull(),
  orderNumber: text("order_number").notNull(),
  email: text("email"),
  billingName: text("billing_name"),
  phone: text("phone"),
  orderStatus: text("order_status"),
  createdAt: text("created_at"),
  productRaw: text("product_raw"),
  parsedEventDate: text("parsed_event_date"),
  parsedEventTime: text("parsed_event_time"),
  parsedEventType: text("parsed_event_type"),
  parsedTicketType: text("parsed_ticket_type"),
  parsedClassName: text("parsed_class_name"),
  skus: text("skus"),
  price: text("price"),
  quantity: integer("quantity"),
  currency: text("currency"),
  subtotal: text("subtotal"),
  shipping: text("shipping"),
  taxes: text("taxes"),
  discountCode: text("discount_code"),
  discountAmount: text("discount_amount"),
  giftCard: text("gift_card"),
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  postal: text("postal"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  orderType: text("order_type").notNull().default("ticket"),
  reconciliationStatus: text("reconciliation_status").default("pending"),
});

export const insertHostingerOrderSchema = createInsertSchema(hostingerOrders).omit({ id: true });
export type InsertHostingerOrder = z.infer<typeof insertHostingerOrderSchema>;
export type HostingerOrder = typeof hostingerOrders.$inferSelect;

export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  postal: text("postal"),
  eventsAttended: text("events_attended").array(),
  ticketTypes: text("ticket_types").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const eventDateNames = pgTable("event_date_names", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventDate: text("event_date").notNull().unique(),
  eventName: text("event_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventDateNameSchema = createInsertSchema(eventDateNames).omit({ id: true, createdAt: true });
export type InsertEventDateName = z.infer<typeof insertEventDateNameSchema>;
export type EventDateName = typeof eventDateNames.$inferSelect;
