import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import passport from "passport";
import bcrypt from "bcryptjs";
import multer from "multer";
import { storage } from "./storage";
import { generateTicketQR } from "./qrcode";
import { generateTicketPDF } from "./pdfGenerator";
import { sendTicketEmail } from "./emailService";
import { sendCampaignEmail, getGmailSenderInfo, checkCampaignReplies, renderCampaignPreviewHtml } from "./campaignEmailService";
import { parseExcelBuffer, assertXlsxFilename } from "./excelParser";
import { insertTicketSchema } from "@shared/schema";
import { parseCsvContent, checkDatabaseDuplicates } from "./csvParser";
import { getUncachableStripeClient } from "./stripeClient";
import { parseFuzzyEventDate, resolveEventCalendarDate } from "./dateUtils";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const CAMPAIGN_ATTACH_DIR = path.join(os.tmpdir(), "moi-campaigns");
try { fs.mkdirSync(CAMPAIGN_ATTACH_DIR, { recursive: true }); } catch {}
try {
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const f of fs.readdirSync(CAMPAIGN_ATTACH_DIR)) {
    const full = path.join(CAMPAIGN_ATTACH_DIR, f);
    try {
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > MAX_AGE_MS) fs.unlinkSync(full);
    } catch {}
  }
} catch {}

function attachmentMetaPath(id: string) {
  return path.join(CAMPAIGN_ATTACH_DIR, `${id}.json`);
}
function attachmentDataPath(id: string, filename: string) {
  return path.join(CAMPAIGN_ATTACH_DIR, `${id}__${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
}
function saveCampaignAttachments(id: string, files: Express.Multer.File[]) {
  const saved = files.map(f => {
    const dataPath = attachmentDataPath(id, f.originalname);
    fs.writeFileSync(dataPath, f.buffer);
    return { filename: f.originalname, dataPath };
  });
  fs.writeFileSync(attachmentMetaPath(id), JSON.stringify(saved));
}
function loadCampaignAttachments(id: string): { buffer: Buffer; filename: string }[] {
  try {
    const metaPath = attachmentMetaPath(id);
    if (!fs.existsSync(metaPath)) return [];
    const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const items: { filename: string; dataPath: string }[] = Array.isArray(raw) ? raw : [raw];
    return items
      .filter(m => m.dataPath && fs.existsSync(m.dataPath))
      .map(m => ({ buffer: fs.readFileSync(m.dataPath), filename: m.filename }));
  } catch { return []; }
}

const campaignContactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
});
const campaignContactsSchema = z.array(campaignContactSchema).min(1).max(10000);

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

const REPLY_POLL_INTERVAL_MS = 5 * 60 * 1000;
let replyPollerStarted = false;
function startReplyPoller() {
  if (replyPollerStarted) return;
  replyPollerStarted = true;
  const tick = async () => {
    try {
      const all = await storage.listEmailCampaigns();
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const c of all) {
        if (c.status !== "completed" && c.status !== "sending") continue;
        const startedAtMs = c.startedAt ? new Date(c.startedAt).getTime() : new Date(c.createdAt).getTime();
        if (startedAtMs < cutoff) continue;
        const recipients = await storage.listCampaignRecipients(c.id);
        const targets = recipients.filter((r) => r.status === "sent" && !r.repliedAt);
        if (targets.length === 0) continue;
        try {
          const repliedIds = await checkCampaignReplies(
            targets.map((r) => ({ recipientId: r.id, email: r.email, messageIdHeader: r.messageId, threadId: r.threadId })),
            startedAtMs,
          );
          let added = 0;
          for (const r of targets) {
            if (repliedIds.has(r.id)) { await storage.updateCampaignRecipient(r.id, { repliedAt: new Date() }); added++; }
          }
          if (added > 0) await storage.updateEmailCampaign(c.id, { repliedCount: c.repliedCount + added });
        } catch (e) { console.error(`Passive reply poll failed for campaign ${c.id}:`, e); }
      }
    } catch (e) { console.error("Reply poller tick error:", e); }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, REPLY_POLL_INTERVAL_MS);
}

async function processCampaignSends(campaignId: string) {
  const campaign = await storage.getEmailCampaign(campaignId);
  if (!campaign) return;
  const meta = { subject: campaign.subject, body: campaign.body, senderName: campaign.senderName, replyTo: campaign.replyTo, useTemplate: campaign.useTemplate };
  const attachments = loadCampaignAttachments(campaignId);
  await storage.updateEmailCampaign(campaignId, { status: "sending", startedAt: new Date() });
  const recipients = await storage.listCampaignRecipients(campaignId);
  for (const r of recipients) {
    if (r.status !== "pending" && r.status !== "failed") continue;
    try {
      const sendResult = await sendCampaignEmail({
        to: r.email, name: r.name, subject: meta.subject, body: meta.body,
        senderName: meta.senderName, replyTo: meta.replyTo,
        useTemplate: meta.useTemplate,
        attachments,
      });
      await storage.updateCampaignRecipient(r.id, { status: "sent", sentAt: new Date(), error: null, messageId: sendResult.messageIdHeader, threadId: sendResult.threadId });
    } catch (err: any) {
      console.error(`Campaign send failed for ${r.email}:`, err?.message || err);
      await storage.updateCampaignRecipient(r.id, { status: "failed", error: String(err?.message || err).slice(0, 500) });
    }
    const sentNow = await storage.countCampaignRecipientsByStatus(campaignId, "sent");
    const failedNow = await storage.countCampaignRecipientsByStatus(campaignId, "failed");
    await storage.updateEmailCampaign(campaignId, { sentCount: sentNow, failedCount: failedNow });
    await sleep(350);
  }
  await storage.updateEmailCampaign(campaignId, { status: "completed", completedAt: new Date() });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const campaignUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

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

async function backfillEventCalendarDates() {
  try {
    const allEvents = await storage.listEvents();

    // Clear calendarDate for TBD/blank events that have a stale calendar date set
    for (const ev of allEvents.filter(e => (e.date === "TBD" || e.date === "") && e.calendarDate)) {
      await storage.updateEvent(ev.id, { calendarDate: null });
      console.log(`📅 Cleared stale calendarDate for TBD event: ${ev.name}`);
    }

    const eventsWithoutDate = allEvents.filter(e => !e.calendarDate && e.date !== "TBD" && e.date !== "");
    if (eventsWithoutDate.length === 0) return;

    // Prefer the admin-confirmed event_date_names mapping (deterministic, year
    // anchored by the mapping's createdAt). Fall back to parsing the event's own
    // date string, anchoring the year on the earliest linked ticket purchase so
    // events without a mapping still get archived.
    const dateNames = await storage.listEventDateNames();
    const dateNameMap = new Map(dateNames.map(dn => [dn.eventDate, dn]));
    const ticketList = await storage.listTickets();
    const earliestPurchaseByEvent = new Map<string, Date>();
    for (const t of ticketList) {
      if (t.purchasedAt) {
        const p = new Date(t.purchasedAt);
        const cur = earliestPurchaseByEvent.get(t.eventId);
        if (!cur || p < cur) earliestPurchaseByEvent.set(t.eventId, p);
      }
    }

    let updated = 0;
    for (const ev of eventsWithoutDate) {
      const derived = resolveEventCalendarDate(ev, dateNameMap, earliestPurchaseByEvent.get(ev.id));
      if (!derived) continue;
      await storage.updateEvent(ev.id, { calendarDate: derived });
      updated++;
    }
    if (updated > 0) {
      console.log(`📅 Backfilled calendarDate for ${updated} event(s)`);
    }
  } catch (err) {
    console.error("⚠️ backfillEventCalendarDates failed (non-blocking):", err);
  }
}

export async function registerRoutes(httpServer: Server, app: Express) {
  await seedAdminUser();
  backfillEventCalendarDates().catch(() => {});

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

  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      const eventList = await storage.listEvents();
      const ticketList = await storage.listTickets();
      const dateNames = await storage.listEventDateNames();
      const dateNameMap = new Map(dateNames.map(dn => [dn.eventDate, dn]));
      // Count tickets by the actual event linkage (eventId), and track the
      // earliest purchase per event to anchor the year for fuzzy date fallback.
      const countByEvent = new Map<string, number>();
      const earliestPurchaseByEvent = new Map<string, Date>();
      for (const t of ticketList) {
        countByEvent.set(t.eventId, (countByEvent.get(t.eventId) || 0) + 1);
        if (t.purchasedAt) {
          const p = new Date(t.purchasedAt);
          const cur = earliestPurchaseByEvent.get(t.eventId);
          if (!cur || p < cur) earliestPurchaseByEvent.set(t.eventId, p);
        }
      }
      const includeArchived = req.query.includeArchived === "true";
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const filtered = includeArchived ? eventList : eventList.filter(e => {
        const calDate = resolveEventCalendarDate(e, dateNameMap, earliestPurchaseByEvent.get(e.id));
        if (!calDate) return true; // unknown date → always show
        return calDate >= today;
      });
      res.json(filtered.map(e => ({ ...e, ticketCount: countByEvent.get(e.id) || 0 })));
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  app.get("/api/tickets", requireAdmin, async (_req, res) => {
    try {
      const ticketList = await storage.listTickets();
      const allEvents = await storage.listEvents();
      const eventMap = new Map(allEvents.map(e => [e.id, e]));
      const dateNames = await storage.listEventDateNames();
      const dateNameMap = new Map(dateNames.map(dn => [dn.eventDate, dn]));
      const earliestPurchaseByEvent = new Map<string, Date>();
      for (const t of ticketList) {
        if (t.purchasedAt) {
          const p = new Date(t.purchasedAt);
          const cur = earliestPurchaseByEvent.get(t.eventId);
          if (!cur || p < cur) earliestPurchaseByEvent.set(t.eventId, p);
        }
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const enriched = ticketList.map(t => {
        const ev = eventMap.get(t.eventId);
        const calDate = resolveEventCalendarDate(ev, dateNameMap, earliestPurchaseByEvent.get(t.eventId));
        const archived = calDate ? calDate < today : false;
        return { ...t, eventName: ev?.name || "", eventDate: ev?.date || "", calendarDate: ev?.calendarDate || null, archived };
      });
      res.json(enriched);
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

  app.post("/api/admin/tickets/:id/cancel", requireAdmin, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      if (ticket.status === "cancelled") return res.status(400).json({ error: "Ticket is already cancelled" });
      if (ticket.status === "used") return res.status(400).json({ error: "Cannot cancel a ticket that has already been used" });
      const updated = await storage.updateTicketStatus(ticket.id, "cancelled");
      res.json(updated);
    } catch (err) {
      console.error("Cancel ticket error:", err);
      res.status(500).json({ error: "Failed to cancel ticket" });
    }
  });

  app.post("/api/admin/tickets/:id/reactivate", requireAdmin, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const allEvents = await storage.listEvents();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const ticketEvent = allEvents.find(e => e.id === ticket.eventId);
      const isArchived = ticketEvent?.calendarDate ? new Date(ticketEvent.calendarDate) < today : false;
      if (!isArchived) {
        return res.status(400).json({ error: "Ticket is not archived" });
      }

      const activeEvent = allEvents.find(e => {
        const sameType = (e.eventType || "").toLowerCase() === (ticket.ticketType || "").toLowerCase();
        if (!sameType) return false;
        if (!e.calendarDate) return true;
        return new Date(e.calendarDate) >= today;
      });

      let resolvedEvent: typeof allEvents[number] | undefined;

      if (activeEvent) {
        await storage.updateTicketEventId(ticket.id, activeEvent.id);
        resolvedEvent = activeEvent;
      } else {
        const currentEvent = await storage.getEvent(ticket.eventId);
        if (!currentEvent) {
          return res.status(404).json({ error: "Linked event not found; cannot reactivate ticket" });
        }
        const cleared = await storage.updateEvent(currentEvent.id, { calendarDate: null });
        if (!cleared) {
          return res.status(500).json({ error: "Failed to clear event date; reactivation aborted" });
        }
        resolvedEvent = cleared;
      }

      const updatedTicket = await storage.getTicket(ticket.id);

      const enriched = {
        ...updatedTicket,
        eventName: resolvedEvent?.name || "",
        eventDate: resolvedEvent?.date || "",
        calendarDate: resolvedEvent?.calendarDate || null,
        archived: false,
      };

      res.json(enriched);
    } catch (err) {
      console.error("Reactivate ticket error:", err);
      res.status(500).json({ error: "Failed to reactivate ticket" });
    }
  });

  app.patch("/api/admin/tickets/:id", requireAdmin, async (req, res) => {
    try {
      const ticket = await storage.getTicket(req.params.id);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const schema = z.object({
        purchaserName: z.string().min(1).max(300).optional(),
        purchaserEmail: z.string().email().max(320).optional(),
        eventId: z.string().uuid().optional(),
        resend: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });

      const { purchaserName, purchaserEmail, eventId, resend } = parsed.data;

      if (eventId) {
        const ev = await storage.getEvent(eventId);
        if (!ev) return res.status(404).json({ error: "Event not found" });
      }

      const updateData: { purchaserName?: string; purchaserEmail?: string; eventId?: string } = {};
      if (purchaserName !== undefined) updateData.purchaserName = purchaserName;
      if (purchaserEmail !== undefined) updateData.purchaserEmail = purchaserEmail;
      if (eventId !== undefined) updateData.eventId = eventId;

      const updated = await storage.updateTicket(ticket.id, updateData);
      if (!updated) return res.status(500).json({ error: "Failed to update ticket" });

      const allEvents = await storage.listEvents();
      const eventMap = new Map(allEvents.map(e => [e.id, e]));
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const ev = eventMap.get(updated.eventId);
      const calDate = ev?.calendarDate ? new Date(ev.calendarDate) : null;
      const archived = calDate ? calDate < today : false;
      const enriched = { ...updated, eventName: ev?.name || "", eventDate: ev?.date || "", calendarDate: ev?.calendarDate || null, archived };

      if (resend) {
        const { sendReissuedTicketEmail } = await import("./emailService");
        sendReissuedTicketEmail({ ticket: updated, event: ev }).catch(err =>
          console.error("⚠️ Reissued email send failed (non-blocking):", err)
        );
      }

      res.json(enriched);
    } catch (err) {
      console.error("Edit ticket error:", err);
      res.status(500).json({ error: "Failed to edit ticket" });
    }
  });

  app.get("/api/ticket/:urlSlug", async (req, res) => {
    try {
      const ticket = await storage.getTicketByUrl(req.params.urlSlug);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      const event = await storage.getEvent(ticket.eventId);

      let displayName = event?.name;
      let locationStreet: string | null = null;
      let locationCity: string | null = null;
      let locationZip: string | null = null;
      if (event?.date && event.date !== "TBD") {
        const eventDateNames = await storage.listEventDateNames();
        const mapping = eventDateNames.find(edn => edn.eventDate === event.date);
        if (mapping) {
          displayName = mapping.eventName;
          locationStreet = mapping.locationStreet;
          locationCity = mapping.locationCity;
          locationZip = mapping.locationZip;
        }
      }

      res.json({ ticket, event: event ? { ...event, displayName, locationStreet, locationCity, locationZip } : event });
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

      let resolvedEvent = event;
      let locationStreet: string | null = null;
      let locationCity: string | null = null;
      let locationZip: string | null = null;
      if (event?.date && event.date !== "TBD") {
        const eventDateNames = await storage.listEventDateNames();
        const mapping = eventDateNames.find(edn => edn.eventDate === event.date);
        if (mapping) {
          resolvedEvent = { ...event, name: mapping.eventName };
          locationStreet = mapping.locationStreet;
          locationCity = mapping.locationCity;
          locationZip = mapping.locationZip;
        }
      }

      const pdfBuffer = await generateTicketPDF(ticket, resolvedEvent, { locationStreet, locationCity, locationZip });

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
      const eventList = await storage.listEvents();

      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const now = new Date();
      const day = now.getDate();
      const suffix = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
      const todayStr = `${months[now.getMonth()]} ${day}${suffix}`;

      const todayEvents = eventList.filter(e => e.date && e.date.includes(todayStr));
      const todayEventTypes = new Set(todayEvents.map(e => e.eventType.toLowerCase()));

      const todayTickets = ticketList.filter(t =>
        t.status !== "cancelled" && todayEventTypes.has(t.ticketType.toLowerCase())
      );

      const totalTickets = todayTickets.length;
      const checkedIn = todayTickets.filter(t => t.status === "used").length;
      const remaining = todayTickets.filter(t => t.status === "valid").length;

      const classBreakdown = todayEvents.map(ev => {
        const classTickets = todayTickets.filter(t =>
          t.ticketType.toLowerCase() === ev.eventType.toLowerCase()
        );
        const displayName = ev.eventType.replace(/^.*Class:\s*/i, "Class: ");
        return {
          eventId: ev.id,
          eventType: ev.eventType,
          displayName,
          time: ev.time || "",
          total: classTickets.length,
          checkedIn: classTickets.filter(t => t.status === "used").length,
        };
      });

      const recentScans = todayTickets
        .filter(t => t.status === "used" && t.usedAt)
        .sort((a, b) => new Date(b.usedAt!).getTime() - new Date(a.usedAt!).getTime())
        .slice(0, 20)
        .map(t => ({
          id: t.id,
          purchaserName: t.purchaserName,
          ticketType: t.ticketType,
          usedAt: t.usedAt,
        }));

      const guestList = todayTickets
        .map(t => ({
          id: t.id,
          purchaserName: t.purchaserName,
          purchaserEmail: t.purchaserEmail,
          ticketType: t.ticketType,
          status: t.status,
          usedAt: t.usedAt,
        }));

      res.json({ totalTickets, checkedIn, remaining, classBreakdown, recentScans, guestList });
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

  app.patch("/api/admin/events/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, date, time, location, eventType, capacity } = req.body;
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (date !== undefined) {
        updateData.date = date;
        updateData.calendarDate = (date && date !== "TBD" && date !== "")
          ? (parseFuzzyEventDate(date) || null)
          : null;
      }
      if (time !== undefined) updateData.time = time;
      if (location !== undefined) updateData.location = location;
      if (eventType !== undefined) updateData.eventType = eventType;
      if (capacity !== undefined) updateData.capacity = capacity !== "" && capacity !== null ? parseInt(capacity) : null;
      const updated = await storage.updateEvent(id, updateData);
      if (!updated) return res.status(404).json({ error: "Event not found" });
      // When the event type changes, propagate it to all tickets of this event
      // so the ticket page badge (which reads ticket.ticketType) reflects it.
      let ticketsUpdated = 0;
      if (eventType !== undefined && eventType !== null && eventType !== "") {
        ticketsUpdated = await storage.updateTicketTypeByEvent(id, eventType);
      }
      res.json({ ...updated, ticketsUpdated });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Update failed" });
    }
  });

  app.delete("/api/admin/events/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteEvent(id);
      if (!deleted) return res.status(404).json({ error: "Event not found" });
      res.json({ deleted: true, id });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Delete failed" });
    }
  });

  app.post("/api/admin/events/merge", requireAdmin, async (req, res) => {
    try {
      const { keepId, mergeIds } = req.body as { keepId: string; mergeIds: string[] };
      if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
        return res.status(400).json({ error: "keepId and mergeIds[] required" });
      }
      const results: Record<string, number> = {};
      for (const fromId of mergeIds) {
        const moved = await storage.reassignTickets(fromId, keepId);
        results[fromId] = moved;
        await storage.deleteEvent(fromId);
      }
      res.json({ kept: keepId, merged: results });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Merge failed" });
    }
  });

  app.get("/api/admin/events/:id/tickets", requireAdmin, async (req, res) => {
    try {
      const allTickets = await storage.listTickets();
      const eventTickets = allTickets.filter(t => t.eventId === req.params.id);
      res.json(eventTickets.map(t => ({ id: t.id, billingName: t.billingName, email: t.email, ticketType: t.ticketType, ticketTime: t.ticketTime })));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch tickets" });
    }
  });

  app.post("/api/admin/tickets/move", requireAdmin, async (req, res) => {
    try {
      const { ticketIds, targetEventId } = req.body as { ticketIds: string[]; targetEventId: string };
      if (!Array.isArray(ticketIds) || ticketIds.length === 0 || !targetEventId) {
        return res.status(400).json({ error: "ticketIds[] and targetEventId required" });
      }
      const targetEvent = await storage.getEvent(targetEventId);
      if (!targetEvent) return res.status(404).json({ error: "Target event not found" });
      const { db } = await import("./db");
      const { tickets: ticketsTable } = await import("@shared/schema");
      const { eq, inArray } = await import("drizzle-orm");
      await db.update(ticketsTable).set({ eventId: targetEventId }).where(inArray(ticketsTable.id, ticketIds));
      res.json({ moved: ticketIds.length, targetEventId });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Move failed" });
    }
  });

  app.post("/api/admin/migrate/event-model", requireAdmin, async (_req, res) => {
    try {
      const { db } = await import("./db");
      const { events: eventsTable, tickets: ticketsTable } = await import("@shared/schema");
      const { eq, inArray } = await import("drizzle-orm");

      const log: string[] = [];

      // Step 1: Rename the OC | Mar 28th event to just its date
      const allEvents = await storage.listEvents();
      for (const ev of allEvents) {
        if (ev.name !== ev.date && ev.date !== "TBD") {
          await db.update(eventsTable).set({ name: ev.date, time: null }).where(eq(eventsTable.id, ev.id));
          log.push(`Renamed event "${ev.name}" → "${ev.date}"`);
        }
      }

      // Step 2: Merge duplicate events with same date (keep first, move tickets to it)
      const eventsByDate = new Map<string, typeof allEvents[0][]>();
      for (const ev of allEvents) {
        const list = eventsByDate.get(ev.date) || [];
        list.push(ev);
        eventsByDate.set(ev.date, list);
      }
      for (const [date, group] of eventsByDate) {
        if (group.length <= 1) continue;
        const [keep, ...dupes] = group;
        const dupeIds = dupes.map(d => d.id);
        await db.update(ticketsTable).set({ eventId: keep.id }).where(inArray(ticketsTable.eventId, dupeIds));
        for (const dupe of dupes) {
          await db.delete(eventsTable).where(eq(eventsTable.id, dupe.id));
          log.push(`Merged event "${dupe.date}" (${dupe.id.slice(0, 8)}) → kept ${keep.id.slice(0, 8)}`);
        }
      }

      // Step 3: Backfill ticketTime for existing tickets from their ticketType / event names
      const timeMap: Record<string, string> = {
        "GA Ticket Access":                  "11 AM - 1PM",
        "Fever Pilates Class: Austen":        "11 AM",
        "Fever Pilates Class: Grazella":      "12:30 PM",
        "Mat Pilates Class with Lauren":      "10 AM",
        "Sculpt Class with Bray":             "12 PM",
      };
      const allTickets = await storage.listTickets();
      let backfilled = 0;
      for (const ticket of allTickets) {
        if (!ticket.ticketTime && timeMap[ticket.ticketType]) {
          await db.update(ticketsTable)
            .set({ ticketTime: timeMap[ticket.ticketType] })
            .where(eq(ticketsTable.id, ticket.id));
          backfilled++;
        }
      }
      log.push(`Backfilled ticketTime for ${backfilled} tickets`);

      res.json({ ok: true, log });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Migration failed" });
    }
  });

  app.post("/api/admin/send-test-email", requireAdmin, async (req, res) => {
    try {
      const { to } = req.body;
      const { sendTicketEmail } = await import("./emailService");
      const mockTicket = {
        id: "test-ticket-preview-001",
        eventId: "evt-preview",
        purchaserName: "Alexandra Rayol",
        purchaserEmail: to || "arayol@gmail.com",
        ticketType: "GA Ticket Access",
        stripeSessionId: "cs_test_preview",
        qrCode: "",
        qrData: "PREVIEW-001",
        ticketUrl: "preview-001",
        status: "valid",
        createdAt: new Date(),
      };
      const mockEvent = {
        id: "evt-preview",
        name: "Matcha On Ice Social",
        date: "Apr 5th",
        time: "11 AM - 1 PM",
        location: "San Diego, CA",
      };
      const ok = await sendTicketEmail({ ticket: mockTicket, event: mockEvent });
      if (ok) res.json({ sent: true, to: mockTicket.purchaserEmail });
      else res.status(500).json({ error: "Email send failed — check server logs" });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Unknown error" });
    }
  });

  app.post("/api/admin/customers/recover-from-stripe", requireAdmin, async (_req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const allTickets = await storage.listTickets();
      const allEvents = await storage.listEvents();
      const eventMap = new Map(allEvents.map(e => [e.id, e]));

      const sessionMap = new Map<string, { eventDates: string[]; ticketTypes: string[] }>();
      for (const ticket of allTickets) {
        if (!ticket.stripeSessionId) continue;
        if (!sessionMap.has(ticket.stripeSessionId)) {
          sessionMap.set(ticket.stripeSessionId, { eventDates: [], ticketTypes: [] });
        }
        const entry = sessionMap.get(ticket.stripeSessionId)!;
        const ev = eventMap.get(ticket.eventId);
        if (ev?.date && !entry.eventDates.includes(ev.date)) entry.eventDates.push(ev.date);
        if (ticket.ticketType && !entry.ticketTypes.includes(ticket.ticketType)) entry.ticketTypes.push(ticket.ticketType);
      }

      let recovered = 0;
      let failed = 0;

      for (const [sessionId, meta] of sessionMap) {
        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          const details = session.customer_details;
          if (!details?.email) { failed++; continue; }

          await storage.createOrUpdateCustomer({
            name: details.name || details.email,
            email: details.email,
            phone: details.phone || null,
            streetAddress: details.address?.line1 || null,
            city: details.address?.city || null,
            state: details.address?.state || null,
            postal: details.address?.postal_code || null,
            eventsAttended: meta.eventDates,
            ticketTypes: meta.ticketTypes,
          }, true);
          recovered++;
          console.log(`  ✅ Recovered: ${details.email}`);
        } catch (err) {
          console.error(`  ❌ Failed session ${sessionId}:`, err);
          failed++;
        }
      }

      res.json({ recovered, failed, total: sessionMap.size });
    } catch (err) {
      console.error("Customer recovery error:", err);
      res.status(500).json({ error: "Recovery failed" });
    }
  });

  app.post("/api/admin/events", requireAdmin, async (req, res) => {
    try {
      const { name, date, time, eventType, location, capacity } = req.body;
      if (!name || !date || !eventType) {
        return res.status(400).json({ error: "name, date, and eventType are required" });
      }
      const existing = await storage.getEventByTypeAndDate(eventType, date);
      if (existing) {
        return res.status(409).json({ error: "An event with this type and date already exists" });
      }
      const event = await storage.createEvent({
        name,
        date,
        time: time || null,
        eventType,
        location: location || "San Diego, CA",
        capacity: capacity ? parseInt(capacity) : null,
        priceInCents: null,
        stripeProductId: null,
        active: true,
        calendarDate: (date && date !== "TBD" && date !== "") ? (parseFuzzyEventDate(date) || null) : null,
      });
      res.json(event);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to create event" });
    }
  });

  app.post("/api/admin/events/sync-from-dates", requireAdmin, async (_req, res) => {
    try {
      const eventDateNames = await storage.listEventDateNames();
      const created: string[] = [];
      const skipped: string[] = [];
      for (const edn of eventDateNames) {
        if (edn.archived) continue;
        const existing = await storage.getEventByDate(edn.eventDate);
        if (!existing) {
          const location = edn.locationCity
            ? `${edn.locationCity}${edn.locationZip ? `, ${edn.locationZip}` : ""}`
            : "San Diego, CA";
          await storage.createEvent({
            name: edn.eventDate,
            date: edn.eventDate,
            time: null,
            eventType: "event",
            location,
            priceInCents: null,
            stripeProductId: null,
            active: true,
            capacity: null,
          });
          created.push(edn.eventDate);
        } else {
          skipped.push(edn.eventDate);
        }
      }
      res.json({ created, skipped });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Sync failed" });
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
      const { eventDate, eventName, locationStreet, locationCity, locationZip } = req.body;
      if (!eventDate || !eventName) {
        return res.status(400).json({ error: "eventDate and eventName are required" });
      }
      const result = await storage.upsertEventDateName({
        eventDate,
        eventName,
        locationStreet: locationStreet || null,
        locationCity: locationCity || null,
        locationZip: locationZip || null,
      });
      // Auto-create the parent event record if it doesn't exist yet
      const existingEvent = await storage.getEventByDate(eventDate);
      if (!existingEvent) {
        await storage.createEvent({
          name: eventDate,
          date: eventDate,
          time: null,
          eventType: "event",
          location: locationCity ? `${locationCity}${locationZip ? `, ${locationZip}` : ""}` : "San Diego, CA",
          priceInCents: null,
          stripeProductId: null,
          active: true,
          capacity: null,
        });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to save event date name" });
    }
  });

  app.patch("/api/admin/event-date-names/:id", requireAdmin, async (req, res) => {
    try {
      const { eventName, locationStreet, locationCity, locationZip, archived } = req.body;
      const data: Record<string, any> = {};
      if (eventName !== undefined) data.eventName = eventName;
      if (locationStreet !== undefined) data.locationStreet = locationStreet || null;
      if (locationCity !== undefined) data.locationCity = locationCity || null;
      if (locationZip !== undefined) data.locationZip = locationZip || null;
      if (archived !== undefined) data.archived = archived;
      const updated = await storage.updateEventDateName(req.params.id, data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to update event date name" });
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

  // ============== Email Campaigns ==============

  startReplyPoller();

  app.get("/api/admin/email-campaigns/sender", requireAdmin, async (_req, res) => {
    try {
      const info = await getGmailSenderInfo();
      res.json(info);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Gmail not connected" });
    }
  });

  app.post("/api/admin/email-campaigns/parse-contacts", requireAdmin, campaignUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });
      assertXlsxFilename(req.file.originalname);
      const result = parseExcelBuffer(req.file.buffer);
      res.json({ ...result, fileName: req.file.originalname });
    } catch (err: any) {
      console.error("Excel parse error:", err);
      const status = err?.name === "ExcelParseError" ? 400 : 500;
      res.status(status).json({ error: err?.message || "Failed to parse file" });
    }
  });

  app.post("/api/admin/email-campaigns/import-contacts", requireAdmin, async (req, res) => {
    try {
      const schema = z.object({
        contacts: z.array(z.object({ name: z.string().min(1).max(200), email: z.string().email().max(320) })).min(1).max(10000),
        sourceFile: z.string().max(255).optional().nullable(),
      });
      const { contacts, sourceFile } = schema.parse(req.body);
      const result = await storage.upsertEmailContacts(
        contacts.map((c) => ({ name: c.name, email: c.email.toLowerCase().trim(), sourceFile: sourceFile ?? null })),
      );
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to import contacts" });
    }
  });

  app.post("/api/admin/email-campaigns/draft", requireAdmin, campaignUpload.array("attachment", 10), async (req, res) => {
    try {
      const { id, subject, body, senderName, replyTo, contacts, useTemplate } = req.body as Record<string, string>;
      if (!subject?.trim() && !body?.trim()) {
        return res.status(400).json({ error: "At least subject or body is required to save a draft" });
      }
      let parsed: { name: string; email: string }[] = [];
      if (contacts) {
        try { const raw = JSON.parse(contacts); parsed = campaignContactsSchema.parse(raw); } catch { parsed = []; }
      }
      const user = req.user as any;
      const files = (req.files || []) as Express.Multer.File[];
      const filenamesJson = files.length > 0 ? JSON.stringify(files.map(f => f.originalname)) : null;
      const totalSize = files.length > 0 ? files.reduce((s, f) => s + f.size, 0) : null;
      let campaign;
      if (id) {
        const existing = await storage.getEmailCampaign(id);
        if (!existing) return res.status(404).json({ error: "Draft not found" });
        if (existing.status !== "draft") {
          return res.status(409).json({ error: `Cannot edit a campaign with status "${existing.status}". Drafts only.` });
        }
        campaign = await storage.updateEmailCampaign(id, {
          subject: subject || "",
          body: body || "",
          senderName: senderName || "Matcha On Ice Team",
          replyTo: replyTo || "contact@matchaonice.com",
          useTemplate: useTemplate === "true",
          ...(filenamesJson ? { attachmentFilename: filenamesJson, attachmentSize: totalSize } : {}),
          totalRecipients: parsed.length || undefined,
        });
        if (!campaign) return res.status(404).json({ error: "Draft not found" });
        if (files.length > 0) saveCampaignAttachments(id, files);
      } else {
        campaign = await storage.createEmailCampaign({
          senderName: senderName || "Matcha On Ice Team",
          replyTo: replyTo || "contact@matchaonice.com",
          subject: subject || "",
          body: body || "",
          useTemplate: useTemplate === "true",
          attachmentFilename: filenamesJson,
          attachmentSize: totalSize,
          totalRecipients: parsed.length,
          status: "draft",
          createdBy: user?.username || null,
        });
        if (files.length > 0) saveCampaignAttachments(campaign.id, files);
      }
      if (parsed.length > 0) {
        const existing = await storage.listCampaignRecipients(campaign.id);
        if (existing.length === 0) {
          await storage.bulkCreateCampaignRecipients(
            parsed.map((c) => ({ campaignId: campaign!.id, name: c.name, email: c.email, status: "pending" })),
          );
        }
      }
      res.json({ campaign });
    } catch (err: any) {
      console.error("Draft save error:", err);
      res.status(500).json({ error: err?.message || "Failed to save draft" });
    }
  });

  app.post("/api/admin/email-campaigns/check-english", requireAdmin, async (req, res) => {
    try {
      const { subject, body } = req.body as { subject?: string; body?: string };
      if (!subject && !body) return res.json({ matches: [] });
      // Basic grammar check — look for common issues without external API
      const matches: { field: "subject" | "body"; offset: number; length: number; message: string; replacements: string[] }[] = [];
      const checks: [RegExp, string, string][] = [
        [/\bi\b/g, "Capitalize 'I'", "I"],
        [/\bdont\b/gi, "Missing apostrophe", "don't"],
        [/\bcant\b/gi, "Missing apostrophe", "can't"],
        [/\bwont\b/gi, "Missing apostrophe", "won't"],
        [/\bits a\b/gi, "Use 'it's' for 'it is'", "it's"],
      ];
      for (const field of ["subject", "body"] as const) {
        const text = field === "subject" ? (subject || "") : (body || "");
        for (const [re, message, replacement] of checks) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(text)) !== null) {
            matches.push({ field, offset: m.index, length: m[0].length, message, replacements: [replacement] });
          }
        }
      }
      res.json({ matches });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Check failed" });
    }
  });

  app.post("/api/admin/email-campaigns/preview", requireAdmin, async (req, res) => {
    try {
      const { body, senderName, name, useTemplate } = req.body as Record<string, unknown>;
      const html = renderCampaignPreviewHtml({
        name: (name as string) || "there",
        body: (body as string) || "",
        senderName: (senderName as string) || "Matcha On Ice Team",
        useTemplate: useTemplate === true || useTemplate === "true",
      });
      res.json({ html });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Preview failed" });
    }
  });

  app.get("/api/admin/email-campaigns/contacts", requireAdmin, async (_req, res) => {
    try {
      const contacts = await storage.listEmailContacts();
      res.json(contacts);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch contacts" });
    }
  });

  app.post("/api/admin/email-campaigns/test-send", requireAdmin, campaignUpload.array("attachment", 10), async (req, res) => {
    try {
      const { subject, body, senderName, replyTo, testEmail, useTemplate } = req.body as Record<string, string>;
      if (!testEmail) return res.status(400).json({ error: "testEmail required" });
      if (!subject) return res.status(400).json({ error: "subject required" });
      const files = (req.files || []) as Express.Multer.File[];
      await sendCampaignEmail({
        to: testEmail,
        name: "Test Recipient",
        subject,
        body: body || "",
        senderName: senderName || "Matcha On Ice Team",
        replyTo: replyTo || "contact@matchaonice.com",
        useTemplate: useTemplate === "true",
        attachments: files.map(f => ({ buffer: f.buffer, filename: f.originalname })),
      });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || "Send failed" });
    }
  });

  app.post("/api/admin/email-campaigns/send", requireAdmin, campaignUpload.array("attachment", 10), async (req, res) => {
    try {
      const { id, subject, body, senderName, replyTo, contacts, useTemplate } = req.body as Record<string, string>;
      if (!subject?.trim()) return res.status(400).json({ error: "subject required" });
      if (!body?.trim()) return res.status(400).json({ error: "body required" });
      let parsed: { name: string; email: string }[] = [];
      if (contacts) {
        try { parsed = campaignContactsSchema.parse(JSON.parse(contacts)); } catch (e: any) {
          return res.status(400).json({ error: "Invalid contacts: " + e.message });
        }
      }
      if (parsed.length === 0) return res.status(400).json({ error: "At least one recipient required" });
      const user = req.user as any;
      const files = (req.files || []) as Express.Multer.File[];
      const filenamesJson = files.length > 0 ? JSON.stringify(files.map(f => f.originalname)) : null;
      const totalSize = files.length > 0 ? files.reduce((s, f) => s + f.size, 0) : null;
      let campaign;
      if (id) {
        const existing = await storage.getEmailCampaign(id);
        if (!existing) return res.status(404).json({ error: "Campaign not found" });
        if (existing.status !== "draft") {
          return res.status(409).json({ error: `Campaign already has status "${existing.status}"` });
        }
        campaign = await storage.updateEmailCampaign(id, {
          subject, body,
          senderName: senderName || "Matcha On Ice Team",
          replyTo: replyTo || "contact@matchaonice.com",
          useTemplate: useTemplate === "true",
          attachmentFilename: filenamesJson || existing.attachmentFilename,
          attachmentSize: totalSize || existing.attachmentSize,
          totalRecipients: parsed.length,
          status: "queued",
        });
        if (!campaign) return res.status(404).json({ error: "Campaign not found" });
        if (files.length > 0) saveCampaignAttachments(id, files);
        const existingRecipients = await storage.listCampaignRecipients(id);
        if (existingRecipients.length === 0) {
          await storage.bulkCreateCampaignRecipients(
            parsed.map((c) => ({ campaignId: id, name: c.name, email: c.email, status: "pending" })),
          );
        }
      } else {
        campaign = await storage.createEmailCampaign({
          senderName: senderName || "Matcha On Ice Team",
          replyTo: replyTo || "contact@matchaonice.com",
          subject, body,
          useTemplate: useTemplate === "true",
          attachmentFilename: filenamesJson,
          attachmentSize: totalSize,
          totalRecipients: parsed.length,
          status: "queued",
          createdBy: user?.username || null,
        });
        if (files.length > 0) saveCampaignAttachments(campaign.id, files);
        await storage.bulkCreateCampaignRecipients(
          parsed.map((c) => ({ campaignId: campaign!.id, name: c.name, email: c.email, status: "pending" })),
        );
      }
      res.json({ campaign });
      processCampaignSends(campaign.id).catch((e) => console.error("processCampaignSends error:", e));
    } catch (err: any) {
      console.error("Campaign send error:", err);
      res.status(500).json({ error: err?.message || "Failed to start campaign" });
    }
  });

  app.get("/api/admin/email-campaigns", requireAdmin, async (_req, res) => {
    try {
      const campaigns = await storage.listEmailCampaigns();
      res.json(campaigns);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch campaigns" });
    }
  });

  app.get("/api/admin/email-campaigns/:id", requireAdmin, async (req, res) => {
    try {
      const campaign = await storage.getEmailCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error: "Not found" });
      const recipients = await storage.listCampaignRecipients(campaign.id);
      res.json({ campaign, recipients });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to fetch campaign" });
    }
  });

  app.post("/api/admin/email-campaigns/:id/retry-failed", requireAdmin, async (req, res) => {
    try {
      const campaign = await storage.getEmailCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error: "Not found" });
      if (campaign.status !== "completed" && campaign.status !== "sending") {
        return res.status(409).json({ error: "Campaign is not in a retryable state" });
      }
      const recipients = await storage.listCampaignRecipients(campaign.id);
      const failedCount = recipients.filter((r) => r.status === "failed").length;
      if (failedCount === 0) return res.status(400).json({ error: "No failed recipients to retry" });
      await storage.updateEmailCampaign(campaign.id, { status: "sending" });
      res.json({ ok: true, retrying: failedCount });
      processCampaignSends(campaign.id).catch((e) => console.error("retry processCampaignSends error:", e));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to retry campaign" });
    }
  });

  app.post("/api/admin/email-campaigns/:id/recipients/:recipientId/retry", requireAdmin, async (req, res) => {
    try {
      const campaign = await storage.getEmailCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      const recipients = await storage.listCampaignRecipients(campaign.id);
      const recipient = recipients.find((r) => r.id === req.params.recipientId);
      if (!recipient) return res.status(404).json({ error: "Recipient not found" });
      if (recipient.status !== "failed") return res.status(409).json({ error: "Recipient is not in failed state" });
      const attachments = loadCampaignAttachments(campaign.id);
      try {
        const sendResult = await sendCampaignEmail({
          to: recipient.email, name: recipient.name,
          subject: campaign.subject, body: campaign.body,
          senderName: campaign.senderName, replyTo: campaign.replyTo,
          useTemplate: campaign.useTemplate,
          attachments,
        });
        await storage.updateCampaignRecipient(recipient.id, { status: "sent", sentAt: new Date(), error: null, messageId: sendResult.messageIdHeader, threadId: sendResult.threadId });
        const sentNow = await storage.countCampaignRecipientsByStatus(campaign.id, "sent");
        const failedNow = await storage.countCampaignRecipientsByStatus(campaign.id, "failed");
        await storage.updateEmailCampaign(campaign.id, { sentCount: sentNow, failedCount: failedNow });
        res.json({ ok: true });
      } catch (sendErr: any) {
        await storage.updateCampaignRecipient(recipient.id, { status: "failed", error: sendErr?.message || String(sendErr) });
        res.status(502).json({ error: sendErr?.message || "Send failed" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to retry recipient" });
    }
  });

  app.delete("/api/admin/email-campaigns/:id", requireAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteEmailCampaign(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Campaign not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to delete campaign" });
    }
  });

  app.post("/api/admin/email-campaigns/:id/check-replies", requireAdmin, async (req, res) => {
    try {
      const campaign = await storage.getEmailCampaign(req.params.id);
      if (!campaign) return res.status(404).json({ error: "Not found" });
      const recipients = await storage.listCampaignRecipients(campaign.id);
      const sentRecipients = recipients.filter((r) => r.status === "sent" && !r.repliedAt);
      const startedAtMs = campaign.startedAt
        ? new Date(campaign.startedAt).getTime()
        : new Date(campaign.createdAt).getTime();
      const repliedIds = await checkCampaignReplies(
        sentRecipients.map((r) => ({ recipientId: r.id, email: r.email, messageIdHeader: r.messageId, threadId: r.threadId })),
        startedAtMs,
      );
      let newReplies = 0;
      for (const r of sentRecipients) {
        if (repliedIds.has(r.id)) { await storage.updateCampaignRecipient(r.id, { repliedAt: new Date() }); newReplies++; }
      }
      const totalReplied = recipients.filter((r) => r.repliedAt).length + newReplies;
      await storage.updateEmailCampaign(campaign.id, { repliedCount: totalReplied });
      res.json({ ok: true, newReplies, totalReplied });
    } catch (err: any) {
      console.error("Reply check error:", err);
      res.status(500).json({ error: err?.message || "Failed to check replies" });
    }
  });
}
