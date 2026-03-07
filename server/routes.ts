import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { generateTicketQR } from "./qrcode";
import { generateTicketPDF } from "./pdfGenerator";
import { sendTicketEmail } from "./emailService";
import { insertTicketSchema } from "@shared/schema";
import { z } from "zod";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: "Not authenticated" });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && (req.user as any)?.role === "adm") return next();
  res.status(403).json({ error: "Admin access required" });
}

async function seedAdminUser() {
  const existing = await storage.getUserByUsername("adm");
  if (!existing) {
    await storage.createUser({ username: "adm", password: "adm99", role: "adm" });
    console.log("🔑 Admin user created (adm/adm99)");
  } else if (!existing.password.startsWith("$2")) {
    const hashed = await bcrypt.hash(existing.password, 10);
    await storage.updateUserPassword(existing.id, hashed);
    console.log("🔑 Admin password migrated to bcrypt");
  }
}

export async function registerRoutes(httpServer: Server, app: Express) {
  await seedAdminUser();

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        const { password, ...safeUser } = user;
        res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
    const { password, ...safeUser } = req.user as any;
    res.json(safeUser);
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "Matcha On Ice - Ticket Management System",
      phase: "Marco M7 - Auth + Mobile",
    });
  });

  app.get("/api/events", requireAuth, async (_req, res) => {
    try {
      const eventList = await storage.listEvents();
      res.json(eventList);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/tickets", requireAdmin, async (_req, res) => {
    try {
      const ticketList = await storage.listTickets();
      res.json(ticketList);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  app.get("/api/tickets/:id", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      res.json(ticket);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  app.get("/api/ticket/:urlSlug", async (req, res) => {
    try {
      const ticket = await storage.getTicketByUrl(req.params.urlSlug);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const event = await storage.getEvent(ticket.eventId);
      res.json({ ticket, event });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  app.post("/api/tickets/:id/validate", requireAuth, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      if (ticket.status === "used") {
        return res.status(400).json({ error: "Ticket already used", ticket });
      }
      if (ticket.status === "cancelled") {
        return res.status(400).json({ error: "Ticket is cancelled", ticket });
      }

      const updated = await storage.validateTicketAtomically(ticket.id);
      if (!updated) {
        return res.status(409).json({ error: "Ticket was already validated by another request" });
      }
      res.json({ message: "Ticket validated successfully", ticket: updated });
    } catch (err) {
      res.status(500).json({ error: "Failed to validate ticket" });
    }
  });

  app.post("/api/tickets/validate-qr", requireAuth, async (req, res) => {
    try {
      const { qrData } = req.body;
      if (!qrData) return res.status(400).json({ error: "qrData is required" });

      const ticket = await storage.getTicketByQrData(qrData);
      if (!ticket) return res.status(404).json({ error: "Invalid QR code" });

      if (ticket.status === "used") {
        const event = await storage.getEvent(ticket.eventId);
        return res.status(400).json({ error: "Ticket already used", ticket, event });
      }
      if (ticket.status === "cancelled") {
        return res.status(400).json({ error: "Ticket is cancelled", ticket });
      }

      const updated = await storage.validateTicketAtomically(ticket.id);
      if (!updated) {
        return res.status(409).json({ error: "Ticket was already validated by another request" });
      }
      const event = await storage.getEvent(ticket.eventId);
      res.json({ message: "Ticket validated successfully", ticket: updated, event });
    } catch (err) {
      res.status(500).json({ error: "Failed to validate ticket" });
    }
  });

  const courtesyTicketSchema = z.object({
    eventId: z.string(),
    purchaserName: z.string().min(1),
    purchaserEmail: z.string().email(),
    ticketType: z.string().default("General"),
  });

  app.post("/api/tickets/courtesy", requireAuth, async (req, res) => {
    try {
      const parsed = courtesyTicketSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
      }

      const { eventId, purchaserName, purchaserEmail, ticketType } = parsed.data;

      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const ticketId = crypto.randomUUID();
      const { qrData, qrCode, ticketUrl } = await generateTicketQR(ticketId);

      const ticket = await storage.createTicket({
        eventId,
        purchaserName,
        purchaserEmail,
        ticketType,
        stripeSessionId: null,
        stripePaymentIntentId: null,
        qrCode,
        qrData,
        ticketUrl,
        status: "valid",
      });

      sendTicketEmail({ ticket, event, isCourtesy: true }).catch(err =>
        console.error("⚠️ Courtesy email send failed (non-blocking):", err)
      );

      res.json({ message: "Courtesy ticket created", ticket });
    } catch (err) {
      res.status(500).json({ error: "Failed to create courtesy ticket" });
    }
  });

  app.get("/api/ticket/:urlSlug/pdf", async (req, res) => {
    try {
      const ticket = await storage.getTicketByUrl(req.params.urlSlug);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (ticket.status === "cancelled") return res.status(400).json({ error: "Ticket is cancelled" });

      const event = ticket.eventId ? await storage.getEvent(ticket.eventId) : undefined;
      const pdfBuffer = await generateTicketPDF(ticket, event);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="ticket-${req.params.urlSlug}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("PDF generation error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  app.get("/api/scanner/stats", requireAuth, async (_req, res) => {
    try {
      const ticketList = await storage.listTickets();
      const totalTickets = ticketList.filter(t => t.status !== "cancelled").length;
      const checkedIn = ticketList.filter(t => t.status === "used").length;
      const remaining = ticketList.filter(t => t.status === "valid").length;

      const recentScans = ticketList
        .filter(t => t.status === "used" && t.usedAt)
        .sort((a, b) => new Date(b.usedAt!).getTime() - new Date(a.usedAt!).getTime())
        .slice(0, 20)
        .map(t => ({
          id: t.id,
          purchaserName: t.purchaserName,
          ticketType: t.ticketType,
          usedAt: t.usedAt,
        }));

      const guestList = ticketList
        .filter(t => t.status !== "cancelled")
        .map(t => ({
          id: t.id,
          purchaserName: t.purchaserName,
          purchaserEmail: t.purchaserEmail,
          ticketType: t.ticketType,
          status: t.status,
          usedAt: t.usedAt,
        }));

      res.json({ totalTickets, checkedIn, remaining, recentScans, guestList });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch scanner stats" });
    }
  });

  app.get("/api/stats", requireAdmin, async (_req, res) => {
    try {
      const ticketList = await storage.listTickets();
      const eventList = await storage.listEvents();

      const eventMap = new Map(eventList.map(e => [e.id, e]));

      const totalTickets = ticketList.length;
      const validTickets = ticketList.filter(t => t.status === "valid").length;
      const usedTickets = ticketList.filter(t => t.status === "used").length;
      const cancelledTickets = ticketList.filter(t => t.status === "cancelled").length;
      const courtesyTickets = ticketList.filter(t => !t.stripeSessionId).length;
      const totalEvents = eventList.length;

      const totalRevenueCents = ticketList
        .filter(t => t.stripeSessionId && (t.status === "valid" || t.status === "used"))
        .reduce((sum, t) => {
          const event = eventMap.get(t.eventId);
          return sum + (event?.priceInCents || 0);
        }, 0);

      const byType = ticketList.reduce((acc: Record<string, number>, t) => {
        const type = t.ticketType || "General";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      res.json({
        totalTickets,
        validTickets,
        usedTickets,
        cancelledTickets,
        courtesyTickets,
        totalEvents,
        totalRevenueCents,
        byType,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const userList = await storage.listUsers();
      const safeUsers = userList.map(({ password, ...u }) => u);
      res.json(safeUsers);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  const createUserSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    role: z.enum(["adm", "user"]).default("user"),
  });

  app.post("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const existing = await storage.getUserByUsername(parsed.data.username);
      if (existing) return res.status(409).json({ error: "Username already exists" });

      const user = await storage.createUser(parsed.data);
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || !["adm", "user"].includes(role)) return res.status(400).json({ error: "Invalid role" });

      const updated = await storage.updateUserRole(req.params.id, role);
      if (!updated) return res.status(404).json({ error: "User not found" });

      const { password, ...safeUser } = updated;
      res.json(safeUser);
    } catch (err) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (currentUser.id === req.params.id) return res.status(400).json({ error: "Cannot delete your own account" });

      const deleted = await storage.deleteUser(req.params.id);
      if (!deleted) return res.status(404).json({ error: "User not found" });
      res.json({ message: "User deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
}
