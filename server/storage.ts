import { eq, and, inArray, desc } from "drizzle-orm";
import { db } from "./db";
import bcrypt from "bcryptjs";
import {
  users, events, tickets, csvUploads, hostingerOrders, customers, eventDateNames,
  type User, type InsertUser,
  type Event, type InsertEvent,
  type Ticket, type InsertTicket,
  type CsvUpload, type InsertCsvUpload,
  type HostingerOrder, type InsertHostingerOrder,
  type Customer, type InsertCustomer,
  type EventDateName, type InsertEventDateName,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createEvent(event: InsertEvent): Promise<Event>;
  getEvent(id: string): Promise<Event | undefined>;
  getEventByStripeProductId(stripeProductId: string): Promise<Event | undefined>;
  listEvents(): Promise<Event[]>;

  createTicket(ticket: InsertTicket): Promise<Ticket>;
  getTicket(id: string): Promise<Ticket | undefined>;
  getTicketByQrData(qrData: string): Promise<Ticket | undefined>;
  getTicketByUrl(ticketUrl: string): Promise<Ticket | undefined>;
  getTicketsByEvent(eventId: string): Promise<Ticket[]>;
  getTicketsByEmail(email: string): Promise<Ticket[]>;
  getTicketsByStripeSession(stripeSessionId: string): Promise<Ticket[]>;
  listTickets(): Promise<Ticket[]>;
  updateTicketStatus(id: string, status: string, usedAt?: Date): Promise<Ticket | undefined>;
  validateTicketAtomically(id: string): Promise<Ticket | undefined>;

  listUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;
  updateUserRole(id: string, role: string): Promise<User | undefined>;
  updateUserPassword(id: string, hashedPassword: string): Promise<void>;

  createCsvUpload(upload: InsertCsvUpload): Promise<CsvUpload>;
  getCsvUpload(id: string): Promise<CsvUpload | undefined>;
  listCsvUploads(): Promise<CsvUpload[]>;
  updateCsvUploadStatus(id: string, status: string): Promise<CsvUpload | undefined>;

  createHostingerOrder(order: InsertHostingerOrder): Promise<HostingerOrder>;
  bulkCreateHostingerOrders(orders: InsertHostingerOrder[]): Promise<HostingerOrder[]>;
  getHostingerOrderByOrderNumber(orderNumber: string): Promise<HostingerOrder | undefined>;
  listHostingerOrders(): Promise<HostingerOrder[]>;
  listHostingerOrdersByImportId(importId: string): Promise<HostingerOrder[]>;
  deleteHostingerOrdersByImportId(importId: string): Promise<number>;
  updateHostingerOrder(id: string, data: Partial<HostingerOrder>): Promise<HostingerOrder | undefined>;
  updateTicketReconciliationStatus(id: string, status: string): Promise<Ticket | undefined>;
  getAllOrderNumbers(): Promise<Set<string>>;

  createOrUpdateCustomer(data: InsertCustomer): Promise<Customer>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  listCustomers(): Promise<Customer[]>;

  listEventDateNames(): Promise<EventDateName[]>;
  upsertEventDateName(data: InsertEventDateName): Promise<EventDateName>;
  deleteEventDateName(id: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = await bcrypt.hash(insertUser.password, 10);
    const [user] = await db.insert(users).values({ ...insertUser, password: hashedPassword }).returning();
    return user;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [created] = await db.insert(events).values(event).returning();
    return created;
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async getEventByStripeProductId(stripeProductId: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.stripeProductId, stripeProductId));
    return event;
  }

  async listEvents(): Promise<Event[]> {
    return db.select().from(events);
  }

  async createTicket(ticket: InsertTicket): Promise<Ticket> {
    const [created] = await db.insert(tickets).values(ticket).returning();
    return created;
  }

  async getTicket(id: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    return ticket;
  }

  async getTicketByQrData(qrData: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.qrData, qrData));
    return ticket;
  }

  async getTicketByUrl(ticketUrl: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketUrl, ticketUrl));
    return ticket;
  }

  async getTicketsByEvent(eventId: string): Promise<Ticket[]> {
    return db.select().from(tickets).where(eq(tickets.eventId, eventId));
  }

  async getTicketsByEmail(email: string): Promise<Ticket[]> {
    return db.select().from(tickets).where(eq(tickets.purchaserEmail, email));
  }

  async listTickets(): Promise<Ticket[]> {
    return db.select().from(tickets);
  }

  async getTicketsByStripeSession(stripeSessionId: string): Promise<Ticket[]> {
    return db.select().from(tickets).where(eq(tickets.stripeSessionId, stripeSessionId));
  }

  async updateTicketStatus(id: string, status: string, usedAt?: Date): Promise<Ticket | undefined> {
    const updateData: Partial<Ticket> = { status };
    if (usedAt) {
      updateData.usedAt = usedAt;
    }
    const [updated] = await db.update(tickets).set(updateData).where(eq(tickets.id, id)).returning();
    return updated;
  }

  async validateTicketAtomically(id: string): Promise<Ticket | undefined> {
    const [updated] = await db
      .update(tickets)
      .set({ status: "used", usedAt: new Date() })
      .where(and(eq(tickets.id, id), eq(tickets.status, "valid")))
      .returning();
    return updated;
  }

  async listUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async updateUserRole(id: string, role: string): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    return updated;
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<void> {
    await db.update(users).set({ password: hashedPassword }).where(eq(users.id, id));
  }

  async createCsvUpload(upload: InsertCsvUpload): Promise<CsvUpload> {
    const [created] = await db.insert(csvUploads).values(upload).returning();
    return created;
  }

  async getCsvUpload(id: string): Promise<CsvUpload | undefined> {
    const [upload] = await db.select().from(csvUploads).where(eq(csvUploads.id, id));
    return upload;
  }

  async listCsvUploads(): Promise<CsvUpload[]> {
    return db.select().from(csvUploads).orderBy(desc(csvUploads.uploadedAt));
  }

  async updateCsvUploadStatus(id: string, status: string): Promise<CsvUpload | undefined> {
    const [updated] = await db.update(csvUploads).set({ status }).where(eq(csvUploads.id, id)).returning();
    return updated;
  }

  async createHostingerOrder(order: InsertHostingerOrder): Promise<HostingerOrder> {
    const [created] = await db.insert(hostingerOrders).values(order).returning();
    return created;
  }

  async bulkCreateHostingerOrders(orders: InsertHostingerOrder[]): Promise<HostingerOrder[]> {
    if (orders.length === 0) return [];
    const created = await db.insert(hostingerOrders).values(orders).returning();
    return created;
  }

  async getHostingerOrderByOrderNumber(orderNumber: string): Promise<HostingerOrder | undefined> {
    const [order] = await db.select().from(hostingerOrders).where(eq(hostingerOrders.orderNumber, orderNumber));
    return order;
  }

  async listHostingerOrders(): Promise<HostingerOrder[]> {
    return db.select().from(hostingerOrders);
  }

  async listHostingerOrdersByImportId(importId: string): Promise<HostingerOrder[]> {
    return db.select().from(hostingerOrders).where(eq(hostingerOrders.importId, importId));
  }

  async deleteHostingerOrdersByImportId(importId: string): Promise<number> {
    const deleted = await db.delete(hostingerOrders).where(eq(hostingerOrders.importId, importId)).returning();
    return deleted.length;
  }

  async updateHostingerOrder(id: string, data: Partial<HostingerOrder>): Promise<HostingerOrder | undefined> {
    const [updated] = await db.update(hostingerOrders).set(data).where(eq(hostingerOrders.id, id)).returning();
    return updated;
  }

  async updateTicketReconciliationStatus(id: string, status: string): Promise<Ticket | undefined> {
    const [updated] = await db.update(tickets).set({ reconciliationStatus: status }).where(eq(tickets.id, id)).returning();
    return updated;
  }

  async getAllOrderNumbers(): Promise<Set<string>> {
    const orders = await db.select({ orderNumber: hostingerOrders.orderNumber }).from(hostingerOrders);
    return new Set(orders.map(o => o.orderNumber));
  }

  async createOrUpdateCustomer(data: InsertCustomer): Promise<Customer> {
    const existing = await this.getCustomerByEmail(data.email);
    if (existing) {
      const updateData: Partial<Customer> = { updatedAt: new Date() };
      if (data.name && !existing.name) updateData.name = data.name;
      if (data.phone && !existing.phone) updateData.phone = data.phone;
      if (data.streetAddress && !existing.streetAddress) updateData.streetAddress = data.streetAddress;
      if (data.city && !existing.city) updateData.city = data.city;
      if (data.state && !existing.state) updateData.state = data.state;
      if (data.postal && !existing.postal) updateData.postal = data.postal;

      const newEvents = data.eventsAttended || [];
      const existingEvents = existing.eventsAttended || [];
      const mergedEvents = [...new Set([...existingEvents, ...newEvents])];
      updateData.eventsAttended = mergedEvents;

      const newTypes = data.ticketTypes || [];
      const existingTypes = existing.ticketTypes || [];
      const mergedTypes = [...new Set([...existingTypes, ...newTypes])];
      updateData.ticketTypes = mergedTypes;

      const [updated] = await db.update(customers).set(updateData).where(eq(customers.id, existing.id)).returning();
      return updated;
    }

    const [created] = await db.insert(customers).values(data).returning();
    return created;
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.email, email));
    return customer;
  }

  async listCustomers(): Promise<Customer[]> {
    return db.select().from(customers);
  }

  async listEventDateNames(): Promise<EventDateName[]> {
    return db.select().from(eventDateNames).orderBy(eventDateNames.eventDate);
  }

  async upsertEventDateName(data: InsertEventDateName): Promise<EventDateName> {
    const existing = await db.select().from(eventDateNames).where(eq(eventDateNames.eventDate, data.eventDate));
    if (existing.length > 0) {
      const [updated] = await db.update(eventDateNames).set({ eventName: data.eventName }).where(eq(eventDateNames.eventDate, data.eventDate)).returning();
      return updated;
    }
    const [created] = await db.insert(eventDateNames).values(data).returning();
    return created;
  }

  async deleteEventDateName(id: string): Promise<boolean> {
    const deleted = await db.delete(eventDateNames).where(eq(eventDateNames.id, id)).returning();
    return deleted.length > 0;
  }
}

export const storage = new DatabaseStorage();
