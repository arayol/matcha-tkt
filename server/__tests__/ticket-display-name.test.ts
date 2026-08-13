/**
 * Tests for ticket display name logic in GET /api/ticket/:urlSlug
 * and GET /api/ticket/:urlSlug/pdf routes.
 *
 * The fix: non-General tickets must use event.name as displayName (not
 * eventDateNames.eventName). General tickets always show "{date} · GA Ticket".
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { createServer } from "http";

// ---------------------------------------------------------------------------
// Shared mock objects — filled in per-test via mockReturnValue / mockResolvedValue
// ---------------------------------------------------------------------------

const mockStorage = {
  // startup helpers
  getUserByUsername: vi.fn().mockResolvedValue({ id: "u1", username: "adm", password: "$2b$10$fakehash", role: "adm" }),
  listEvents: vi.fn().mockResolvedValue([]),
  listEventDateNames: vi.fn().mockResolvedValue([]),
  listTickets: vi.fn().mockResolvedValue([]),
  getTicket: vi.fn().mockResolvedValue(null),
  getEventByTypeAndDate: vi.fn().mockResolvedValue(null),
  // per-test
  getTicketByUrl: vi.fn(),
  getEvent: vi.fn(),
};

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../qrcode", () => ({ generateTicketQR: vi.fn() }));
vi.mock("../emailService", () => ({ sendTicketEmail: vi.fn() }));
vi.mock("../campaignEmailService", () => ({
  sendCampaignEmail: vi.fn(),
  getGmailSenderInfo: vi.fn(),
  checkCampaignReplies: vi.fn(),
  renderCampaignPreviewHtml: vi.fn(),
}));
vi.mock("../stripeClient", () => ({ getUncachableStripeClient: vi.fn() }));
vi.mock("../excelParser", () => ({
  parseExcelBuffer: vi.fn(),
  assertXlsxFilename: vi.fn(),
}));
vi.mock("../csvParser", () => ({
  parseCsvContent: vi.fn(),
  checkDatabaseDuplicates: vi.fn(),
}));
vi.mock("../ticketValidation", () => ({
  validateTicketBeforeSend: vi.fn().mockReturnValue({ valid: true, reasons: [] }),
}));
vi.mock("../dateUtils", () => ({
  parseFuzzyEventDate: vi.fn(),
  resolveEventCalendarDate: vi.fn().mockReturnValue(null),
}));

// The PDF generator is mocked to return a tiny buffer and to capture what
// event object (and its name) it receives.
const mockGenerateTicketPDF = vi.fn().mockResolvedValue(Buffer.from("PDF"));
vi.mock("../pdfGenerator", () => ({ generateTicketPDF: mockGenerateTicketPDF }));

// ---------------------------------------------------------------------------
// Build the express app once for all tests
// ---------------------------------------------------------------------------

let app: express.Express;

beforeAll(async () => {
  const { registerRoutes } = await import("../routes");
  app = express();
  app.use(express.json());

  // Minimal session / passport stubs so registerRoutes doesn't crash
  app.use((req: any, _res: any, next: any) => {
    req.isAuthenticated = () => false;
    req.user = null;
    next();
  });

  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-1",
    eventId: "event-1",
    purchaserName: "Jane Doe",
    purchaserEmail: "jane@example.com",
    ticketType: "General",
    status: "valid",
    qrCode: "qr",
    qrData: "qr-data",
    ticketUrl: "test-slug",
    stripeSessionId: null,
    stripePaymentIntentId: null,
    issuedBy: null,
    purchasedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    name: "Sculpt + Sip",
    date: "Jun 14th",
    time: "7pm",
    eventType: "Sculpt",
    location: "San Diego, CA",
    priceInCents: 5000,
    stripeProductId: null,
    active: true,
    capacity: null,
    calendarDate: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /api/ticket/:urlSlug — display name
// ---------------------------------------------------------------------------

describe("GET /api/ticket/:urlSlug", () => {
  it("returns event.name as displayName for non-General tickets", async () => {
    const ticket = makeTicket({ ticketType: "Sculpt" });
    const event = makeEvent({ name: "Sculpt + Sip", date: "Jun 14th" });

    mockStorage.getTicketByUrl.mockResolvedValue(ticket);
    mockStorage.getEvent.mockResolvedValue(event);
    // Provide a mapping that has a different name — should NOT affect non-General
    mockStorage.listEventDateNames.mockResolvedValue([
      { id: "edn-1", eventDate: "Jun 14th", eventName: "Wrong Name From Mapping", locationStreet: "123 Main St", locationCity: "San Diego", locationZip: "92101" },
    ]);

    const res = await request(app).get("/api/ticket/test-slug");

    expect(res.status).toBe(200);
    expect(res.body.event.displayName).toBe("Sculpt + Sip");
    expect(res.body.event.displayName).not.toBe("Wrong Name From Mapping");
  });

  it("returns '{date} · GA Ticket' as displayName for General tickets", async () => {
    const ticket = makeTicket({ ticketType: "General" });
    const event = makeEvent({ name: "Sculpt + Sip", date: "Jun 14th" });

    mockStorage.getTicketByUrl.mockResolvedValue(ticket);
    mockStorage.getEvent.mockResolvedValue(event);
    mockStorage.listEventDateNames.mockResolvedValue([]);

    const res = await request(app).get("/api/ticket/test-slug");

    expect(res.status).toBe(200);
    expect(res.body.event.displayName).toBe("Jun 14th · GA Ticket");
  });

  it("does NOT override displayName for Members tickets", async () => {
    const ticket = makeTicket({ ticketType: "Members" });
    const event = makeEvent({ name: "Members Event: Elevate", date: "Jul 10th", eventType: "Members" });

    mockStorage.getTicketByUrl.mockResolvedValue(ticket);
    mockStorage.getEvent.mockResolvedValue(event);
    mockStorage.listEventDateNames.mockResolvedValue([
      { id: "edn-2", eventDate: "Jul 10th", eventName: "Old Mapping Name", locationStreet: null, locationCity: null, locationZip: null },
    ]);

    const res = await request(app).get("/api/ticket/test-slug");

    expect(res.status).toBe(200);
    expect(res.body.event.displayName).toBe("Members Event: Elevate");
  });

  it("does NOT override displayName for Yoga tickets", async () => {
    const ticket = makeTicket({ ticketType: "Yoga" });
    const event = makeEvent({ name: "Yoga & Wine Night", date: "Aug 5th", eventType: "Yoga" });

    mockStorage.getTicketByUrl.mockResolvedValue(ticket);
    mockStorage.getEvent.mockResolvedValue(event);
    mockStorage.listEventDateNames.mockResolvedValue([]);

    const res = await request(app).get("/api/ticket/test-slug");

    expect(res.status).toBe(200);
    expect(res.body.event.displayName).toBe("Yoga & Wine Night");
  });

  it("General ticket with TBD date does NOT produce GA Ticket label", async () => {
    const ticket = makeTicket({ ticketType: "General" });
    const event = makeEvent({ name: "Upcoming Event", date: "TBD" });

    mockStorage.getTicketByUrl.mockResolvedValue(ticket);
    mockStorage.getEvent.mockResolvedValue(event);
    mockStorage.listEventDateNames.mockResolvedValue([]);

    const res = await request(app).get("/api/ticket/test-slug");

    expect(res.status).toBe(200);
    // TBD date → no transformation → displayName stays as event.name
    expect(res.body.event.displayName).toBe("Upcoming Event");
  });

  it("returns 404 when ticket not found", async () => {
    mockStorage.getTicketByUrl.mockResolvedValue(null);

    const res = await request(app).get("/api/ticket/no-such-slug");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ticket/:urlSlug/pdf — event name passed to PDF generator
// ---------------------------------------------------------------------------

describe("GET /api/ticket/:urlSlug/pdf", () => {
  it("passes event.name (not mapping name) to PDF generator for non-General tickets", async () => {
    mockGenerateTicketPDF.mockClear();

    const ticket = makeTicket({ ticketType: "Sculpt" });
    const event = makeEvent({ name: "Sculpt + Sip", date: "Jun 14th" });

    mockStorage.getTicketByUrl.mockResolvedValue(ticket);
    mockStorage.getEvent.mockResolvedValue(event);
    mockStorage.listEventDateNames.mockResolvedValue([
      { id: "edn-1", eventDate: "Jun 14th", eventName: "Should Not Appear", locationStreet: "123 Main St", locationCity: "San Diego", locationZip: "92101" },
    ]);

    const res = await request(app).get("/api/ticket/test-slug/pdf");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);

    // The event object passed to generateTicketPDF must have the correct name
    const [_ticket, eventArg] = mockGenerateTicketPDF.mock.calls[0];
    expect(eventArg.name).toBe("Sculpt + Sip");
    expect(eventArg.name).not.toBe("Should Not Appear");
  });

  it("passes '{date} · GA Ticket' as event name to PDF for General tickets", async () => {
    mockGenerateTicketPDF.mockClear();

    const ticket = makeTicket({ ticketType: "General" });
    const event = makeEvent({ name: "Sculpt + Sip", date: "Jun 14th" });

    mockStorage.getTicketByUrl.mockResolvedValue(ticket);
    mockStorage.getEvent.mockResolvedValue(event);
    mockStorage.listEventDateNames.mockResolvedValue([]);

    const res = await request(app).get("/api/ticket/test-slug/pdf");

    expect(res.status).toBe(200);

    const [_ticket, eventArg] = mockGenerateTicketPDF.mock.calls[0];
    expect(eventArg.name).toBe("Jun 14th · GA Ticket");
  });

  it("passes event.name unchanged to PDF for Members tickets", async () => {
    mockGenerateTicketPDF.mockClear();

    const ticket = makeTicket({ ticketType: "Members" });
    const event = makeEvent({ name: "Members Event: Elevate", date: "Jul 10th", eventType: "Members" });

    mockStorage.getTicketByUrl.mockResolvedValue(ticket);
    mockStorage.getEvent.mockResolvedValue(event);
    mockStorage.listEventDateNames.mockResolvedValue([
      { id: "edn-2", eventDate: "Jul 10th", eventName: "Old Name", locationStreet: null, locationCity: null, locationZip: null },
    ]);

    const res = await request(app).get("/api/ticket/test-slug/pdf");

    expect(res.status).toBe(200);

    const [_ticket, eventArg] = mockGenerateTicketPDF.mock.calls[0];
    expect(eventArg.name).toBe("Members Event: Elevate");
  });

  it("returns 404 for unknown ticket slug", async () => {
    mockStorage.getTicketByUrl.mockResolvedValue(null);

    const res = await request(app).get("/api/ticket/no-such-slug/pdf");
    expect(res.status).toBe(404);
  });

  it("returns 400 for cancelled tickets", async () => {
    const ticket = makeTicket({ ticketType: "General", status: "cancelled" });
    mockStorage.getTicketByUrl.mockResolvedValue(ticket);

    const res = await request(app).get("/api/ticket/test-slug/pdf");
    expect(res.status).toBe(400);
  });
});
