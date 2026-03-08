import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import multer from "multer";
import { storage } from "./storage";
import { generateTicketQR } from "./qrcode";
import { generateTicketPDF } from "./pdfGenerator";
import { sendTicketEmail } from "./emailService";
import { insertTicketSchema } from "@shared/schema";
import { parseCsvContent, checkDatabaseDuplicates } from "./csvParser";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

      const issuer = req.user as any;
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
        issuedBy: issuer?.username || null,
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

  app.post("/api/admin/csv/upload", requireAdmin, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      const csvContent = req.file.buffer.toString("utf-8");
      const parseResult = parseCsvContent(csvContent);

      const existingOrderNumbers = await storage.getAllOrderNumbers();
      const dbDuplicates = checkDatabaseDuplicates(parseResult.rows, existingOrderNumbers);

      const newRows = parseResult.rows.filter(
        row => !existingOrderNumbers.has(row.orderNumber)
      );

      const user = req.user as any;
      const csvUpload = await storage.createCsvUpload({
        fileName: req.file.originalname,
        uploadedBy: user.username,
        recordCount: newRows.length,
        status: "active",
      });

      const ordersToInsert = newRows.map(row => ({
        importId: csvUpload.id,
        orderNumber: row.orderNumber,
        email: row.email || null,
        billingName: row.billingName || null,
        phone: row.phone || null,
        orderStatus: row.orderStatus || null,
        createdAt: row.createdAt || null,
        productRaw: row.productRaw || null,
        parsedEventDate: row.parsedEventDate || null,
        parsedEventTime: row.parsedEventTime || null,
        parsedEventType: row.parsedEventType || null,
        parsedTicketType: row.parsedTicketType || null,
        parsedClassName: row.parsedClassName || null,
        skus: row.skus || null,
        price: row.price || null,
        quantity: row.quantity,
        currency: row.currency || null,
        subtotal: row.subtotal || null,
        shipping: row.shipping || null,
        taxes: row.taxes || null,
        discountCode: row.discountCode || null,
        discountAmount: row.discountAmount || null,
        giftCard: row.giftCard || null,
        streetAddress: row.streetAddress || null,
        city: row.city || null,
        state: row.state || null,
        postal: row.postal || null,
        paymentMethod: row.paymentMethod || null,
        notes: row.notes || null,
        orderType: row.orderType,
        reconciliationStatus: "pending",
      }));

      const created = await storage.bulkCreateHostingerOrders(ordersToInsert);

      for (const row of newRows) {
        if (row.email) {
          try {
            await storage.createOrUpdateCustomer({
              name: row.billingName || row.email,
              email: row.email,
              phone: row.phone || null,
              streetAddress: row.streetAddress || null,
              city: row.city || null,
              state: row.state || null,
              postal: row.postal || null,
              eventsAttended: row.parsedClassName ? [row.parsedClassName] : [],
              ticketTypes: row.parsedTicketType ? [row.parsedTicketType] : [],
            });
          } catch (e) {
            // non-blocking
          }
        }
      }

      res.json({
        upload: csvUpload,
        imported: created.length,
        totalParsed: parseResult.totalParsed,
        duplicatesInCsv: parseResult.duplicatesInCsv,
        duplicatesInDb: dbDuplicates,
        skipped: dbDuplicates.length,
      });
    } catch (err) {
      console.error("CSV upload error:", err);
      res.status(500).json({ error: "Failed to process CSV upload" });
    }
  });

  app.get("/api/admin/csv/uploads", requireAdmin, async (_req, res) => {
    try {
      const uploads = await storage.listCsvUploads();
      res.json(uploads);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch upload history" });
    }
  });

  app.post("/api/admin/csv/uploads/:id/revert", requireAdmin, async (req, res) => {
    try {
      const upload = await storage.getCsvUpload(req.params.id);
      if (!upload) return res.status(404).json({ error: "Upload not found" });
      if (upload.status === "reverted") return res.status(400).json({ error: "Upload already reverted" });

      const deletedCount = await storage.deleteHostingerOrdersByImportId(req.params.id);
      await storage.updateCsvUploadStatus(req.params.id, "reverted");

      res.json({ message: "Upload reverted", deletedRecords: deletedCount });
    } catch (err) {
      res.status(500).json({ error: "Failed to revert upload" });
    }
  });

  app.get("/api/admin/csv/orders", requireAdmin, async (_req, res) => {
    try {
      const orders = await storage.listHostingerOrders();
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/admin/reconciliation", requireAdmin, async (_req, res) => {
    try {
      const allHostingerOrders = await storage.listHostingerOrders();
      const ticketList = await storage.listTickets();
      const eventList = await storage.listEvents();

      const eventMap = new Map(eventList.map(e => [e.id, e]));

      const activeHostingerOrders = allHostingerOrders.filter(
        o => o.reconciliationStatus === "pending" || !o.reconciliationStatus
      );
      const reconciledCount = allHostingerOrders.filter(
        o => o.reconciliationStatus === "reconciled" || o.reconciliationStatus === "deleted"
      ).length;

      const activeTickets = ticketList.filter(
        t => !t.reconciliationStatus || t.reconciliationStatus === "pending"
      );

      const ticketsByEmail = new Map<string, typeof ticketList>();
      for (const ticket of activeTickets) {
        const key = ticket.purchaserEmail.toLowerCase();
        if (!ticketsByEmail.has(key)) ticketsByEmail.set(key, []);
        ticketsByEmail.get(key)!.push(ticket);
      }

      const csvEmails = new Set(activeHostingerOrders.map(o => (o.email || "").toLowerCase()).filter(Boolean));

      const divergences: any[] = [];

      for (const order of activeHostingerOrders) {
        const emailKey = (order.email || "").toLowerCase();
        const matchingTickets = ticketsByEmail.get(emailKey) || [];

        if (matchingTickets.length === 0) {
          divergences.push({
            id: order.id,
            type: "missing_in_stripe",
            source: "csv",
            orderNumber: order.orderNumber,
            email: order.email,
            billingName: order.billingName,
            csvPrice: order.subtotal || order.price,
            csvProduct: order.productRaw,
            csvTicketType: order.parsedTicketType,
            csvPhone: order.phone,
            csvDiscountCode: order.discountCode,
            orderType: order.orderType,
            eventDate: order.parsedEventDate,
            stripeData: null,
          });
        } else {
          let bestMatch: { ticket: typeof ticketList[0]; event: typeof eventList[0] | undefined; diffs: string[] } | null = null;
          let perfectMatch = false;

          for (const ticket of matchingTickets) {
            const event = eventMap.get(ticket.eventId);
            const diffs: string[] = [];

            if (order.billingName && ticket.purchaserName &&
                order.billingName.toLowerCase() !== ticket.purchaserName.toLowerCase()) {
              diffs.push("name");
            }

            const priceStr = order.subtotal || order.price;
            if (priceStr && event?.priceInCents) {
              const csvPriceCents = Math.round(parseFloat(priceStr.replace(/[^0-9.]/g, "")) * 100);
              if (csvPriceCents !== event.priceInCents) {
                diffs.push("price");
              }
            }

            if (order.parsedTicketType && ticket.ticketType &&
                order.parsedTicketType.toLowerCase() !== ticket.ticketType.toLowerCase()) {
              diffs.push("ticketType");
            }

            if (diffs.length === 0) {
              perfectMatch = true;
              break;
            }

            if (!bestMatch || diffs.length < bestMatch.diffs.length) {
              bestMatch = { ticket, event, diffs };
            }
          }

          if (!perfectMatch && bestMatch) {
            divergences.push({
              id: order.id,
              type: "data_mismatch",
              source: "both",
              orderNumber: order.orderNumber,
              email: order.email,
              billingName: order.billingName,
              csvPrice: order.subtotal || order.price,
              csvProduct: order.productRaw,
              csvTicketType: order.parsedTicketType,
              csvPhone: order.phone,
              csvDiscountCode: order.discountCode,
              orderType: order.orderType,
              eventDate: order.parsedEventDate,
              stripeData: {
                ticketId: bestMatch.ticket.id,
                name: bestMatch.ticket.purchaserName,
                email: bestMatch.ticket.purchaserEmail,
                ticketType: bestMatch.ticket.ticketType,
                eventName: bestMatch.event?.name,
                priceInCents: bestMatch.event?.priceInCents,
              },
              differences: bestMatch.diffs,
            });
          }
        }
      }

      for (const ticket of activeTickets) {
        if (!ticket.stripeSessionId) continue;
        const emailKey = ticket.purchaserEmail.toLowerCase();
        if (!csvEmails.has(emailKey)) {
          const event = eventMap.get(ticket.eventId);
          divergences.push({
            id: ticket.id,
            type: "missing_in_csv",
            source: "stripe",
            orderNumber: null,
            email: ticket.purchaserEmail,
            billingName: ticket.purchaserName,
            csvPrice: null,
            csvProduct: null,
            csvTicketType: null,
            csvPhone: null,
            csvDiscountCode: null,
            orderType: "ticket",
            eventDate: event?.date,
            stripeData: {
              ticketId: ticket.id,
              name: ticket.purchaserName,
              email: ticket.purchaserEmail,
              ticketType: ticket.ticketType,
              eventName: event?.name,
              priceInCents: event?.priceInCents,
            },
          });
        }
      }

      const summary = {
        totalCsvRecords: allHostingerOrders.length,
        totalStripeTickets: ticketList.filter(t => t.stripeSessionId).length,
        totalDivergences: divergences.length,
        missingInStripe: divergences.filter(d => d.type === "missing_in_stripe").length,
        missingInCsv: divergences.filter(d => d.type === "missing_in_csv").length,
        dataMismatches: divergences.filter(d => d.type === "data_mismatch").length,
        reconciled: reconciledCount,
      };

      res.json({ divergences, summary });
    } catch (err) {
      console.error("Reconciliation error:", err);
      res.status(500).json({ error: "Failed to run reconciliation" });
    }
  });

  app.post("/api/admin/reconciliation/apply", requireAdmin, async (req, res) => {
    try {
      const { action, ids } = req.body;
      if (!action || !Array.isArray(ids)) {
        return res.status(400).json({ error: "action and ids[] required" });
      }

      const status = action === "delete" ? "deleted" : action === "reconcile" ? "reconciled" : null;
      if (!status) {
        return res.status(400).json({ error: "Invalid action. Use 'delete' or 'reconcile'." });
      }

      let processed = 0;
      for (const id of ids) {
        const hostingerResult = await storage.updateHostingerOrder(id, { reconciliationStatus: status });
        if (hostingerResult) {
          processed++;
        } else {
          const ticketResult = await storage.updateTicketReconciliationStatus(id, status);
          if (ticketResult) processed++;
        }
      }

      res.json({ message: `${processed} records processed`, processed });
    } catch (err) {
      res.status(500).json({ error: "Failed to apply reconciliation" });
    }
  });

  app.post("/api/admin/reconciliation/generate-tickets", requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids[] required" });
      }

      const allOrders = await storage.listHostingerOrders();
      const orders = allOrders.filter(o =>
        ids.includes(o.id) &&
        o.reconciliationStatus !== "reconciled" &&
        o.reconciliationStatus !== "deleted" &&
        o.orderType !== "vendor"
      );
      if (orders.length === 0) {
        return res.status(404).json({ error: "No eligible orders found (already reconciled, deleted, or vendor orders are excluded)" });
      }

      const eventList = await storage.listEvents();
      const eventDateNames = await storage.listEventDateNames();
      const issuer = req.user as any;
      const results: { orderNumber: string; name: string; email: string; status: string; error?: string }[] = [];

      for (const order of orders) {
        try {
          if (!order.email) {
            results.push({ orderNumber: order.orderNumber, name: order.billingName || "", email: "", status: "skipped", error: "No email address" });
            continue;
          }

          let matchedEvent = eventList.find(e =>
            (order.parsedEventDate && e.date && order.parsedEventDate === e.date) ||
            (order.parsedClassName && e.name && (
              e.name.toLowerCase().includes(order.parsedClassName.toLowerCase()) ||
              order.parsedClassName.toLowerCase().includes(e.name.toLowerCase())
            ))
          );

          if (!matchedEvent && order.parsedEventDate) {
            const eventDateName = eventDateNames.find(edn => edn.eventDate === order.parsedEventDate);
            const eventName = eventDateName?.eventName || `Event - ${order.parsedEventDate}`;
            const created = await storage.createEvent({
              name: eventName,
              date: order.parsedEventDate,
              time: order.parsedEventTime || "TBD",
              eventType: order.parsedEventType || "Event Ticket",
              location: "San Diego, CA",
              active: true,
            });
            matchedEvent = created;
            eventList.push(created);
          }

          if (!matchedEvent) {
            results.push({ orderNumber: order.orderNumber, name: order.billingName || "", email: order.email, status: "skipped", error: "Could not match to an event" });
            continue;
          }

          const ticketId = crypto.randomUUID();
          const { qrData, qrCode, ticketUrl } = await generateTicketQR(ticketId);
          const ticketType = order.parsedTicketType || "General Admission";

          const ticket = await storage.createTicket({
            eventId: matchedEvent.id,
            purchaserName: order.billingName || "Guest",
            purchaserEmail: order.email,
            ticketType,
            stripeSessionId: null,
            stripePaymentIntentId: null,
            qrCode,
            qrData,
            ticketUrl,
            status: "valid",
            issuedBy: issuer?.username || "reconciliation",
          });

          await storage.updateHostingerOrder(order.id, { reconciliationStatus: "reconciled" });

          sendTicketEmail({ ticket, event: matchedEvent, isCourtesy: false }).catch(err =>
            console.error(`⚠️ Email failed for order ${order.orderNumber}:`, err)
          );

          results.push({ orderNumber: order.orderNumber, name: order.billingName || "", email: order.email, status: "sent" });
        } catch (err: any) {
          results.push({ orderNumber: order.orderNumber, name: order.billingName || "", email: order.email || "", status: "error", error: err.message });
        }
      }

      const sent = results.filter(r => r.status === "sent").length;
      const skipped = results.filter(r => r.status === "skipped").length;
      const errors = results.filter(r => r.status === "error").length;

      res.json({ message: `${sent} tickets sent, ${skipped} skipped, ${errors} errors`, results, sent, skipped, errors });
    } catch (err) {
      console.error("Generate tickets error:", err);
      res.status(500).json({ error: "Failed to generate tickets" });
    }
  });

  app.patch("/api/admin/reconciliation/:id", requireAdmin, async (req, res) => {
    try {
      const { billingName, email, price, parsedTicketType } = req.body;
      const updateData: any = {};
      if (billingName !== undefined) updateData.billingName = billingName;
      if (email !== undefined) updateData.email = email;
      if (price !== undefined) updateData.price = price;
      if (parsedTicketType !== undefined) updateData.parsedTicketType = parsedTicketType;

      const updated = await storage.updateHostingerOrder(req.params.id, updateData);
      if (!updated) return res.status(404).json({ error: "Order not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update order" });
    }
  });

  app.get("/api/admin/reconciliation/export", requireAdmin, async (_req, res) => {
    try {
      const allHostingerOrders = await storage.listHostingerOrders();
      const ticketList = await storage.listTickets();
      const eventList = await storage.listEvents();
      const eventMap = new Map(eventList.map(e => [e.id, e]));

      const activeOrders = allHostingerOrders.filter(
        o => o.reconciliationStatus === "pending" || !o.reconciliationStatus
      );
      const activeTickets = ticketList.filter(
        t => !t.reconciliationStatus || t.reconciliationStatus === "pending"
      );

      const ticketsByEmail = new Map<string, typeof ticketList>();
      for (const ticket of activeTickets) {
        const key = ticket.purchaserEmail.toLowerCase();
        if (!ticketsByEmail.has(key)) ticketsByEmail.set(key, []);
        ticketsByEmail.get(key)!.push(ticket);
      }

      const csvEmails = new Set(activeOrders.map(o => (o.email || "").toLowerCase()).filter(Boolean));

      let csv = "Type,Source,Order Number,Email,CSV Name,Stripe Name,CSV Price,Stripe Price,Product,Event Date,Differences\n";

      for (const order of activeOrders) {
        const emailKey = (order.email || "").toLowerCase();
        const matchingTickets = ticketsByEmail.get(emailKey) || [];
        const priceStr = order.subtotal || order.price;

        if (matchingTickets.length === 0) {
          csv += `Missing in Stripe,CSV,${order.orderNumber},${order.email},${order.billingName},,${priceStr},,${order.productRaw},${order.parsedEventDate},\n`;
        } else {
          for (const ticket of matchingTickets) {
            const event = eventMap.get(ticket.eventId);
            const diffs: string[] = [];
            if (order.billingName && ticket.purchaserName && order.billingName.toLowerCase() !== ticket.purchaserName.toLowerCase()) diffs.push("name");
            if (priceStr && event?.priceInCents) {
              const csvPriceCents = Math.round(parseFloat(priceStr.replace(/[^0-9.]/g, "")) * 100);
              if (csvPriceCents !== event.priceInCents) diffs.push("price");
            }
            if (diffs.length > 0) {
              csv += `Data Mismatch,Both,${order.orderNumber},${order.email},${order.billingName},${ticket.purchaserName},${priceStr},${event?.priceInCents ? (event.priceInCents / 100).toFixed(2) : ""},${order.productRaw},${order.parsedEventDate},${diffs.join(";")}\n`;
            }
          }
        }
      }

      for (const ticket of activeTickets) {
        if (!ticket.stripeSessionId) continue;
        const emailKey = ticket.purchaserEmail.toLowerCase();
        if (!csvEmails.has(emailKey)) {
          const event = eventMap.get(ticket.eventId);
          csv += `Missing in CSV,Stripe,,${ticket.purchaserEmail},,${ticket.purchaserName},,${event?.priceInCents ? (event.priceInCents / 100).toFixed(2) : ""},${event?.name},${event?.date},\n`;
        }
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=reconciliation-export.csv");
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: "Failed to export reconciliation" });
    }
  });

  app.get("/api/admin/events/comparison", requireAdmin, async (_req, res) => {
    try {
      const eventList = await storage.listEvents();
      const ticketList = await storage.listTickets();
      const allHostingerOrders = await storage.listHostingerOrders();
      const hostingerOrdersList = allHostingerOrders.filter(
        o => o.reconciliationStatus !== "deleted"
      );

      const comparison = eventList.map(event => {
        const eventTickets = ticketList.filter(t => t.eventId === event.id);
        const csvOrders = hostingerOrdersList.filter(o => {
          if (o.parsedEventDate && event.date && o.parsedEventDate === event.date) return true;
          if (o.parsedClassName && event.name) {
            const cn = o.parsedClassName.toLowerCase();
            const en = event.name.toLowerCase();
            if (en.includes(cn) || cn.includes(en)) return true;
          }
          return false;
        });

        const memberTickets = eventTickets.filter(t => t.ticketType.toLowerCase().includes("member"));
        const generalTickets = eventTickets.filter(t =>
          t.ticketType.toLowerCase().includes("general") || t.ticketType.toLowerCase() === "general admission"
        );
        const vendorOrders = csvOrders.filter(o => o.orderType === "vendor");
        const ticketOrders = csvOrders.filter(o => o.orderType === "ticket");

        const revenueCents = eventTickets
          .filter(t => t.stripeSessionId && (t.status === "valid" || t.status === "used"))
          .length * (event.priceInCents || 0);

        const csvRevenue = ticketOrders.reduce((sum, o) => {
          const price = parseFloat((o.subtotal || o.price || "0").replace(/[^0-9.]/g, ""));
          return sum + (isNaN(price) ? 0 : price);
        }, 0);

        const classBreakdown: Record<string, number> = {};
        for (const order of csvOrders) {
          const cls = order.parsedClassName || "Unknown";
          classBreakdown[cls] = (classBreakdown[cls] || 0) + (order.quantity || 1);
        }

        const timeBreakdown: Record<string, number> = {};
        for (const order of csvOrders) {
          const time = order.parsedEventTime || "Unknown";
          timeBreakdown[time] = (timeBreakdown[time] || 0) + (order.quantity || 1);
        }

        return {
          eventId: event.id,
          eventName: event.name,
          eventDate: event.date,
          eventTime: event.time,
          eventType: event.eventType,
          totalTickets: eventTickets.length,
          memberTickets: memberTickets.length,
          generalTickets: generalTickets.length,
          vendorCount: vendorOrders.length,
          stripeRevenueCents: revenueCents,
          csvRevenue,
          capacity: event.capacity,
          occupancyRate: event.capacity ? Math.round((eventTickets.length / event.capacity) * 100) : null,
          checkedIn: eventTickets.filter(t => t.status === "used").length,
          classBreakdown,
          timeBreakdown,
          csvOrderCount: csvOrders.length,
        };
      });

      res.json(comparison);
    } catch (err) {
      console.error("Event comparison error:", err);
      res.status(500).json({ error: "Failed to generate event comparison" });
    }
  });

  app.get("/api/admin/event-date-names", requireAdmin, async (_req, res) => {
    try {
      const names = await storage.listEventDateNames();
      res.json(names);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch event date names" });
    }
  });

  app.post("/api/admin/event-date-names", requireAdmin, async (req, res) => {
    try {
      const { eventDate, eventName } = req.body;
      if (!eventDate || !eventName) {
        return res.status(400).json({ error: "eventDate and eventName are required" });
      }
      const result = await storage.upsertEventDateName({ eventDate, eventName });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to save event date name" });
    }
  });

  app.delete("/api/admin/event-date-names/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteEventDateName(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete event date name" });
    }
  });
}
