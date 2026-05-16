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
  time: text("time"),
  eventType: text("event_type").notNull().default("event"),
  location: text("location").default("San Diego, CA"),
  capacity: integer("capacity"),
  priceInCents: integer("price_in_cents"),
  stripeProductId: text("stripe_product_id").unique(),
  active: boolean("active").default(true),
  calendarDate: timestamp("calendar_date"),
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
  ticketTime: text("ticket_time"),
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
  locationStreet: text("location_street"),
  locationCity: text("location_city"),
  locationZip: text("location_zip"),
  archived: boolean("archived").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEventDateNameSchema = createInsertSchema(eventDateNames).omit({ id: true, createdAt: true });
export type InsertEventDateName = z.infer<typeof insertEventDateNameSchema>;
export type EventDateName = typeof eventDateNames.$inferSelect;

export const emailContacts = pgTable("email_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  sourceFile: text("source_file"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailContactSchema = createInsertSchema(emailContacts).omit({ id: true, createdAt: true });
export type InsertEmailContact = z.infer<typeof insertEmailContactSchema>;
export type EmailContact = typeof emailContacts.$inferSelect;

export const emailCampaigns = pgTable("email_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderName: text("sender_name").notNull().default("Matcha On Ice Team"),
  replyTo: text("reply_to").notNull().default("hello@matchaonice.com"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  attachmentFilename: text("attachment_filename"),
  attachmentSize: integer("attachment_size"),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  repliedCount: integer("replied_count").notNull().default(0),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: text("created_by"),
});

export const insertEmailCampaignSchema = createInsertSchema(emailCampaigns).omit({
  id: true, createdAt: true, startedAt: true, completedAt: true,
  sentCount: true, failedCount: true, repliedCount: true,
});
export type InsertEmailCampaign = z.infer<typeof insertEmailCampaignSchema>;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;

export const emailCampaignRecipients = pgTable("email_campaign_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  sentAt: timestamp("sent_at"),
  repliedAt: timestamp("replied_at"),
  messageId: text("message_id"),
  threadId: text("thread_id"),
});

export const insertEmailCampaignRecipientSchema = createInsertSchema(emailCampaignRecipients).omit({
  id: true, sentAt: true, repliedAt: true, messageId: true, threadId: true,
});
export type InsertEmailCampaignRecipient = z.infer<typeof insertEmailCampaignRecipientSchema>;
export type EmailCampaignRecipient = typeof emailCampaignRecipients.$inferSelect;
