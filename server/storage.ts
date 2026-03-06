import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  users, events, tickets,
  type User, type InsertUser,
  type Event, type InsertEvent,
  type Ticket, type InsertTicket,
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
    const [user] = await db.insert(users).values(insertUser).returning();
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
}

export const storage = new DatabaseStorage();
