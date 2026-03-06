import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { generateTicketQR } from "./qrcode";
import { generateTicketPDF } from "./pdfGenerator";
import { sendTicketEmail } from "./emailService";
import { insertTicketSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(httpServer: Server, app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      message: "Matcha On Ice - Ticket Management System",
      phase: "Marco M1 - Backend Core",
    });
  });

  app.get("/api/events", async (_req, res) => {
    try {
      const eventList = await storage.listEvents();
      res.json(eventList);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/tickets", async (_req, res) => {
    try {
      const ticketList = await storage.listTickets();
      res.json(ticketList);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  app.get("/api/tickets/:id", async (req, res) => {
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

  app.post("/api/tickets/:id/validate", async (req, res) => {
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

  app.post("/api/tickets/validate-qr", async (req, res) => {
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

  app.post("/api/tickets/courtesy", async (req, res) => {
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

  app.get("/api/stats", async (_req, res) => {
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
}
