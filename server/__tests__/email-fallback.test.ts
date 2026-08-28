import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gmailSend: vi.fn(),
  updateTicketEmailDelivery: vi.fn(),
  listEventDateNames: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    gmail: () => ({
      users: {
        messages: { send: mocks.gmailSend },
        getProfile: vi.fn(),
      },
    }),
  },
}));

vi.mock("../pdfGenerator", () => ({
  generateTicketPDF: vi.fn().mockResolvedValue(Buffer.from("test-pdf")),
}));

vi.mock("../storage", () => ({
  storage: {
    updateTicketEmailDelivery: mocks.updateTicketEmailDelivery,
    listEventDateNames: mocks.listEventDateNames,
  },
}));

const ticket = {
  id: "ticket-test",
  purchaserName: "Test Buyer",
  purchaserEmail: "buyer@example.com",
  ticketType: "General",
  ticketUrl: "ticket-url",
};

const event = {
  id: "event-test",
  name: "Matcha Test",
  date: "Sep 1st",
  time: "10 AM",
  location: "San Diego, CA",
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("ticket email provider fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listEventDateNames.mockResolvedValue([]);
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "Matcha On Ice <tickets@example.com>";
  });

  it("sends directly through Resend for the provider test path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: "resend-direct" })));
    const { sendTicketEmail } = await import("../emailService");

    const result = await sendTicketEmail({ ticket, event, preferredProvider: "resend" });

    expect(result).toMatchObject({
      success: true,
      provider: "resend",
      fallbackUsed: false,
      messageId: "resend-direct",
    });
  });

  it("uses Resend once when Gmail is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: "resend-fallback" })));
    const { sendTicketEmail } = await import("../emailService");

    const result = await sendTicketEmail({ ticket, event });

    expect(result).toMatchObject({
      success: true,
      provider: "resend",
      fallbackUsed: true,
      messageId: "resend-fallback",
    });
    expect(result.primaryError).toContain("Gmail not connected");
  });

  it("reports both provider errors when neither can deliver", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ message: "sender rejected" }, 403)));
    const { sendTicketEmail } = await import("../emailService");

    const result = await sendTicketEmail({ ticket, event });

    expect(result.success).toBe(false);
    expect(result.provider).toBe("none");
    expect(result.primaryError).toContain("Gmail not connected");
    expect(result.fallbackError).toContain("sender rejected");
  });

  it("does not risk a duplicate Resend delivery after an ambiguous Gmail timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{
        settings: {
          access_token: "gmail-test-token",
          expires_at: "2099-01-01T00:00:00.000Z",
          email: "sender@example.com",
        },
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.gmailSend.mockRejectedValueOnce(new Error("socket timeout after request"));
    const { sendTicketEmail } = await import("../emailService");

    const result = await sendTicketEmail({ ticket, event });

    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.error).toContain("outcome uncertain");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateTicketEmailDelivery).toHaveBeenCalledWith(
      ticket.id,
      expect.objectContaining({ emailDeliveryStatus: "unknown" }),
    );
  });
});