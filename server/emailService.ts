// Gmail integration connector (google-mail OAuth)
// Uses getUncachableGmailClient() — never cache, tokens expire
import { google } from "googleapis";
import { generateTicketPDF } from "./pdfGenerator";
import * as fs from "fs";
import * as path from "path";

const LOGO_BUFFER: Buffer = (() => {
  try {
    const logoPath = path.join(process.cwd(), "server", "matcha-logo.png");
    return fs.readFileSync(logoPath);
  } catch {
    return Buffer.alloc(0);
  }
})();

let connectionSettings: any;

export interface TicketEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider?: "gmail" | "resend" | "none";
  fallbackUsed?: boolean;
  primaryError?: string;
  fallbackError?: string;
}

function safeEmailError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/access[_-]?token[=:]\s*\S+/gi, "access_token=[redacted]")
    .slice(0, 500);
}

async function recordTicketEmailDelivery(
  ticketId: string | undefined,
  data: {
    emailDeliveryStatus: string;
    emailDeliveryError?: string | null;
    emailLastAttemptAt?: Date | null;
    emailSentAt?: Date | null;
    emailMessageId?: string | null;
    emailDeliveryProvider?: string | null;
    emailFallbackUsed?: boolean | null;
    emailPrimaryError?: string | null;
    emailFallbackError?: string | null;
    emailPrimaryMessageId?: string | null;
    emailFallbackMessageId?: string | null;
  },
) {
  if (!ticketId) return;
  try {
    const { storage } = await import("./storage");
    await storage.updateTicketEmailDelivery(ticketId, data);
  } catch (error) {
    // Delivery tracking must never turn a successfully sent email into a failed send.
    console.error("⚠️ Failed to persist ticket email delivery status:", error);
  }
}

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    },
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Gmail not connected");
  }

  return accessToken;
}

function getSenderEmail(): string {
  return (
    connectionSettings?.settings?.email ||
    connectionSettings?.settings?.oauth?.credentials?.email ||
    connectionSettings?.settings?.user_email ||
    "noreply@matchaonice.com"
  );
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

function makeRfc2822(params: {
  to: string;
  from: string;
  subject: string;
  htmlBody: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  logoBuffer: Buffer;
}) {
  const mixedBoundary = `MOI_mixed_${Date.now()}`;
  const relatedBoundary = `MOI_related_${Date.now()}`;

  const htmlBase64 = Buffer.from(params.htmlBody, "utf-8").toString("base64");
  const encodedSubject = `=?UTF-8?B?${Buffer.from(params.subject, "utf-8").toString("base64")}?=`;

  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
    ``,
    `--${relatedBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    htmlBase64.match(/.{1,76}/g)!.join("\r\n"),
    ``,
    `--${relatedBoundary}`,
    `Content-Type: image/png; name="matcha-logo.png"`,
    `Content-ID: <matcha-logo>`,
    `Content-Disposition: inline; filename="matcha-logo.png"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    params.logoBuffer.toString("base64").match(/.{1,76}/g)!.join("\r\n"),
    ``,
    `--${relatedBoundary}--`,
    ``,
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${params.pdfFilename}"`,
    `Content-Disposition: attachment; filename="${params.pdfFilename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    params.pdfBuffer.toString("base64").match(/.{1,76}/g)!.join("\r\n"),
    ``,
    `--${mixedBoundary}--`,
  ];

  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

interface PreparedTicketEmail {
  to: string;
  subject: string;
  htmlBody: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
}

function getResendSenderEmail(): string {
  return process.env.RESEND_FROM_EMAIL || "Matcha On Ice <noreply@matchaonice.com>";
}

function getResendHtml(htmlBody: string): string {
  if (!LOGO_BUFFER.length) return htmlBody;
  return htmlBody.replace(/cid:matcha-logo/g, `data:image/png;base64,${LOGO_BUFFER.toString("base64")}`);
}

async function sendViaResend(email: PreparedTicketEmail): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Resend not configured");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getResendSenderEmail(),
      to: [email.to],
      subject: email.subject,
      html: getResendHtml(email.htmlBody),
      attachments: [{
        filename: email.pdfFilename,
        content: email.pdfBuffer.toString("base64"),
      }],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerError = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.error === "string"
        ? payload.error
        : `HTTP ${response.status}`;
    throw new Error(`Resend: ${providerError}`);
  }

  if (!payload?.id || typeof payload.id !== "string") {
    throw new Error("Resend returned no message ID");
  }

  return payload.id;
}

async function sendPreparedTicketEmail(params: {
  ticket: any;
  email: PreparedTicketEmail;
  attemptAt: Date;
  preferredProvider?: "auto" | "resend";
}): Promise<TicketEmailResult> {
  const { ticket, email, attemptAt, preferredProvider = "auto" } = params;
  let gmailError: string | undefined;
  let gmailSendAttempted = false;

  if (preferredProvider === "resend") {
    try {
      const messageId = await sendViaResend(email);
      await recordTicketEmailDelivery(ticket?.id, {
        emailDeliveryStatus: "sent",
        emailDeliveryError: null,
        emailSentAt: new Date(),
        emailMessageId: messageId,
        emailDeliveryProvider: "resend",
        emailFallbackUsed: false,
        emailPrimaryError: null,
        emailFallbackError: null,
        emailPrimaryMessageId: null,
        emailFallbackMessageId: messageId,
      });
      console.log(`📧 Ticket email sent directly via Resend to ${ticket.purchaserEmail} for ticket ${ticket.id}`);
      return { success: true, messageId, provider: "resend", fallbackUsed: false };
    } catch (error) {
      const resendError = safeEmailError(error);
      await recordTicketEmailDelivery(ticket?.id, {
        emailDeliveryStatus: "failed",
        emailDeliveryError: resendError,
        emailLastAttemptAt: attemptAt,
        emailDeliveryProvider: "none",
        emailFallbackUsed: false,
        emailPrimaryError: null,
        emailFallbackError: resendError,
        emailPrimaryMessageId: null,
        emailFallbackMessageId: null,
      });
      return {
        success: false,
        error: resendError,
        provider: "none",
        fallbackUsed: false,
        fallbackError: resendError,
      };
    }
  }

  try {
    const gmail = await getUncachableGmailClient();
    const rawMessage = makeRfc2822({
      to: email.to,
      from: `Matcha On Ice <${getSenderEmail()}>`,
      subject: email.subject,
      htmlBody: email.htmlBody,
      pdfBuffer: email.pdfBuffer,
      pdfFilename: email.pdfFilename,
      logoBuffer: LOGO_BUFFER,
    });
    gmailSendAttempted = true;
    const sendResponse = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawMessage },
    });
    const messageId = sendResponse.data.id || undefined;
    await recordTicketEmailDelivery(ticket?.id, {
      emailDeliveryStatus: "sent",
      emailDeliveryError: null,
      emailSentAt: new Date(),
      emailMessageId: messageId || null,
      emailDeliveryProvider: "gmail",
      emailFallbackUsed: false,
      emailPrimaryError: null,
      emailFallbackError: null,
      emailPrimaryMessageId: messageId || null,
      emailFallbackMessageId: null,
    });
    console.log(`📧 Ticket email sent via Gmail to ${ticket.purchaserEmail} for ticket ${ticket.id}`);
    return { success: true, messageId, provider: "gmail", fallbackUsed: false };
  } catch (error) {
    gmailError = safeEmailError(error);
    console.error(`❌ Gmail ticket email failed for ${ticket?.id}:`, gmailError);

    const status = Number(
      (error as any)?.code
      || (error as any)?.status
      || (error as any)?.response?.status,
    );
    const definitelyRejected = !gmailSendAttempted
      || (status >= 400 && status < 500)
      || /gmail not connected|invalid credentials|invalid[_ ]grant|insufficient permission|unauthenticated|unauthorized|forbidden/i.test(gmailError);

    if (!definitelyRejected) {
      const uncertainError = `Gmail outcome uncertain; Resend fallback was not attempted to avoid a duplicate email. ${gmailError}`;
      await recordTicketEmailDelivery(ticket?.id, {
        emailDeliveryStatus: "unknown",
        emailDeliveryError: uncertainError,
        emailLastAttemptAt: attemptAt,
        emailDeliveryProvider: "gmail",
        emailFallbackUsed: false,
        emailPrimaryError: gmailError,
        emailFallbackError: null,
        emailPrimaryMessageId: null,
        emailFallbackMessageId: null,
      });
      return {
        success: false,
        error: uncertainError,
        provider: "none",
        fallbackUsed: false,
        primaryError: gmailError,
      };
    }
  }

  try {
    const messageId = await sendViaResend(email);
    await recordTicketEmailDelivery(ticket?.id, {
      emailDeliveryStatus: "sent",
      emailDeliveryError: null,
      emailSentAt: new Date(),
      emailMessageId: messageId,
      emailDeliveryProvider: "resend",
      emailFallbackUsed: true,
      emailPrimaryError: gmailError,
      emailFallbackError: null,
      emailPrimaryMessageId: null,
      emailFallbackMessageId: messageId,
    });
    console.log(`📧 Ticket email sent via Resend fallback to ${ticket.purchaserEmail} for ticket ${ticket.id}`);
    return {
      success: true,
      messageId,
      provider: "resend",
      fallbackUsed: true,
      primaryError: gmailError,
    };
  } catch (error) {
    const resendError = safeEmailError(error);
    const combinedError = `Gmail: ${gmailError || "unknown error"}; Resend: ${resendError}`;
    console.error(`❌ Gmail and Resend ticket email failed for ${ticket?.id}:`, combinedError);
    await recordTicketEmailDelivery(ticket?.id, {
      emailDeliveryStatus: "failed",
      emailDeliveryError: combinedError,
      emailLastAttemptAt: attemptAt,
      emailDeliveryProvider: "none",
      emailFallbackUsed: true,
      emailPrimaryError: gmailError,
      emailFallbackError: resendError,
      emailPrimaryMessageId: null,
      emailFallbackMessageId: null,
    });
    return {
      success: false,
      error: combinedError,
      provider: "none",
      fallbackUsed: true,
      primaryError: gmailError,
      fallbackError: resendError,
    };
  }
}

function buildTicketEmailHtml(params: {
  name: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  ticketType: string;
  ticketUrl: string;
  isCourtesy: boolean;
  locationStreet?: string | null;
  locationCity?: string | null;
  locationZip?: string | null;
  observations?: string | null;
}) {
  const baseUrl = process.env.APP_BASE_URL
    || (process.env.WEB_REPL_RENEWAL ? "https://matcha-rayol.replit.app" : null)
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
    || "http://localhost:5000";

  const fullTicketUrl = `${baseUrl}/ticket/${params.ticketUrl}`;
  const firstName = params.name.split(" ")[0];
  const emailCity = params.locationCity || "San Diego, CA";
  const emailAddressLine = params.locationStreet && params.locationCity
    ? `${params.locationStreet}, ${params.locationCity}${params.locationZip ? ` ${params.locationZip}` : ""}`
    : "";
  const observationsHtml = params.observations && params.observations.trim()
    ? `<div class="observations-box">${params.observations.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Ticket is Confirmed – Matcha On Ice</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Jost:wght@300;400;500;600&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background-color: #f0ede6;
      font-family: 'Jost', Helvetica, Arial, sans-serif;
      color: #2a2520;
      -webkit-font-smoothing: antialiased;
    }

    .email-wrapper {
      background-color: #f0ede6;
      padding: 5% 3%;
    }

    .email-container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #faf9f6;
      border-radius: 2px;
      overflow: hidden;
      box-shadow: 0 4px 40px rgba(42, 37, 32, 0.10);
    }

    .header {
      background-color: #352d17;
      padding: 8% 8% 7%;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .header::before {
      content: '';
      position: absolute;
      top: -60px; left: -60px;
      width: 200px; height: 200px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(148,167,121,0.18) 0%, transparent 70%);
    }

    .header::after {
      content: '';
      position: absolute;
      bottom: -40px; right: -40px;
      width: 160px; height: 160px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(148,167,121,0.12) 0%, transparent 70%);
    }

    .header img.logo {
      width: 55%;
      max-width: 280px;
      min-width: 140px;
      position: relative;
      z-index: 1;
    }

    .header-divider {
      width: 40px;
      height: 1px;
      background: rgba(148,167,121,0.6);
      margin: 24px auto 0;
    }

    .hero-band {
      background: linear-gradient(135deg, #94a779 0%, #7a8f63 100%);
      padding: 5% 8%;
      text-align: center;
    }

    .hero-band .confirmed-label {
      font-family: 'Jost', sans-serif;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.7);
      margin-bottom: 10px;
    }

    .hero-band h1 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 38px;
      font-weight: 300;
      color: #ffffff;
      line-height: 1.1;
      letter-spacing: 0.5px;
    }

    .hero-band h1 em {
      font-style: italic;
      font-weight: 400;
    }


    .body-content {
      padding: 7% 8% 0;
      text-align: center;
    }

    .greeting {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 22px;
      font-weight: 300;
      color: #2a2520;
      margin-bottom: 6px;
      text-align: center;
    }

    .event-name-row {
      display: inline-block;
      font-size: 13px;
      font-weight: 400;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #94a779;
      margin-bottom: 32px;
      border-bottom: 1px solid #d5cfc4;
      padding-bottom: 20px;
      width: 100%;
      text-align: center;
    }

    .ticket-card {
      background: #2a2520;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 36px;
      position: relative;
    }

    .ticket-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, #94a779, #b4c89e, #94a779);
    }

    .ticket-header {
      padding: 5% 6% 4%;
      border-bottom: 1px dashed rgba(255,255,255,0.1);
      text-align: center;
    }

    .event-title-ticket {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 26px;
      font-weight: 400;
      color: #ffffff;
      letter-spacing: 0.3px;
      line-height: 1.2;
      text-align: center;
    }

    .ticket-type-badge {
      display: inline-block;
      margin-top: 10px;
      padding: 4px 14px;
      background: rgba(148,167,121,0.2);
      border: 1px solid rgba(148,167,121,0.4);
      border-radius: 20px;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #b4c89e;
    }

    .ticket-details {
      padding: 4% 6%;
      display: table;
      width: 100%;
    }

    .detail-col {
      display: table-cell;
      width: 33.33%;
      padding-right: 3%;
      vertical-align: top;
      text-align: center;
    }

    .detail-col:last-child { padding-right: 0; }

    .detail-label {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: rgba(255,255,255,0.35);
      margin-bottom: 6px;
    }

    .detail-value {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 20px;
      font-weight: 400;
      color: #ffffff;
      line-height: 1.2;
    }

    .observations-box {
      margin: 0 6% 4%;
      padding: 3% 5%;
      background: rgba(148,167,121,0.12);
      border-top: 1px solid rgba(148,167,121,0.4);
      border-bottom: 1px solid rgba(148,167,121,0.4);
      text-align: center;
      font-family: 'Jost', sans-serif;
      font-size: 13px;
      font-weight: 400;
      color: #e8e4da;
      line-height: 1.5;
      white-space: pre-line;
    }

    .ticket-footer {
      background: rgba(0,0,0,0.2);
      padding: 3% 6%;
      display: table;
      width: 100%;
    }

    .ticket-footer-inner {
      display: table-cell;
      vertical-align: middle;
      text-align: center;
    }

    .ticket-footer-text {
      font-size: 12px;
      font-weight: 300;
      color: rgba(255,255,255,0.45);
      line-height: 1.5;
    }

    .instructions { margin-bottom: 36px; }

    .instruction-item {
      display: table;
      width: 100%;
      padding: 16px 0;
      border-bottom: 1px solid #ede8df;
    }

    .instruction-item:first-child { border-top: 1px solid #ede8df; }

    .instruction-num-cell {
      display: table-cell;
      width: 36px;
      vertical-align: top;
      padding-top: 2px;
    }

    .instruction-num {
      display: inline-block;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid #94a779;
      text-align: center;
      font-size: 11px;
      font-weight: 600;
      color: #94a779;
      line-height: 28px;
    }

    .instruction-text {
      display: table-cell;
      font-size: 14px;
      font-weight: 300;
      color: #5a5248;
      line-height: 1.6;
      text-align: left;
      padding-left: 16px;
      vertical-align: top;
    }

    .instruction-text strong {
      font-weight: 500;
      color: #2a2520;
    }

    .cta-section {
      text-align: center;
      padding: 8px 0 36px;
    }

    .cta-button {
      display: inline-block;
      padding: 14px 40px;
      background: #94a779;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      border-radius: 1px;
    }

    .footer {
      background: #352d17;
      padding: 6% 8%;
      text-align: center;
    }

    .footer img.logo-footer {
      width: 40%;
      max-width: 220px;
      min-width: 120px;
      opacity: 0.7;
      margin-bottom: 20px;
    }

    .footer-text {
      font-size: 12px;
      font-weight: 300;
      color: rgba(255,255,255,0.4);
      line-height: 1.8;
    }

    .footer-text a {
      color: rgba(180,200,158,0.8);
      text-decoration: none;
    }

    .footer-divider {
      width: 30px;
      height: 1px;
      background: rgba(148,167,121,0.3);
      margin: 16px auto;
    }

    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 0 !important; }
      .email-container { border-radius: 0 !important; }
      .hero-band h1 { font-size: 28px !important; }
      .ticket-details { display: block !important; }
      .detail-col {
        display: block !important;
        width: 100% !important;
        padding: 6px 0 !important;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      .detail-col:last-child { border-bottom: none !important; }
      .ticket-footer { display: block !important; }
      .ticket-footer-inner { display: block !important; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">

      <!-- HEADER -->
      <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#352d17" style="background-color:#352d17;">
        <tr><td class="header" style="background-color:#352d17;">
          <img class="logo" src="cid:matcha-logo" alt="Matcha On Ice Social Club" />
          <div class="header-divider"></div>
        </td></tr>
      </table>

      <!-- HERO BAND -->
      <div class="hero-band">
        <div class="confirmed-label">Booking Confirmed</div>
        <h1>Your ticket is<br><em>confirmed.</em></h1>
      </div>

      <!-- BODY -->
      <div class="body-content">

        <p class="greeting">Hello, ${firstName},</p>
        <div class="event-name-row">${params.eventName}</div>

        <!-- TICKET CARD -->
        <div class="ticket-card">
          <div class="ticket-header">
            <div class="event-title-ticket">${params.eventName}</div>
            ${emailAddressLine ? `<div style="font-family:'Jost',sans-serif;font-size:13px;font-weight:300;color:rgba(255,255,255,0.55);margin-top:6px;letter-spacing:0.3px;">${emailAddressLine}</div>` : ""}
            <div class="ticket-type-badge">${params.ticketType}</div>
          </div>

          <div class="ticket-details">
            <div class="detail-col">
              <div class="detail-label">Date</div>
              <div class="detail-value">${params.eventDate}</div>
            </div>
            <div class="detail-col">
              <div class="detail-label">Time</div>
              <div class="detail-value">${params.eventTime}</div>
            </div>
            <div class="detail-col">
              <div class="detail-label">Location</div>
              <div class="detail-value">${emailCity}</div>
            </div>
          </div>
          ${observationsHtml}

          <div class="ticket-footer">
            <div class="ticket-footer-inner">
              <div class="ticket-footer-text">
                Your QR code is attached to this email as a PDF ticket.<br>
                Present it at the entrance for quick check-in.
              </div>
            </div>
          </div>
        </div>

        <!-- INSTRUCTIONS -->
        <div class="instructions">
          <div class="instruction-item">
            <div class="instruction-num-cell"><div class="instruction-num">1</div></div>
            <div class="instruction-text">
              <strong>Save your ticket.</strong> Your ticket PDF is attached to this email. You can also view it online anytime by clicking the button below.
            </div>
          </div>
          <div class="instruction-item">
            <div class="instruction-num-cell"><div class="instruction-num">2</div></div>
            <div class="instruction-text">
              <strong>Show your QR code at the door.</strong> Our team will scan it at the entrance for quick and seamless check-in.
            </div>
          </div>
          <div class="instruction-item">
            <div class="instruction-num-cell"><div class="instruction-num">3</div></div>
            <div class="instruction-text">
              <strong>Questions?</strong> Simply reply to this email and we'll be happy to help.
            </div>
          </div>
        </div>

        <!-- CTA -->
        <div class="cta-section">
          <a href="${fullTicketUrl}" class="cta-button">View My Ticket</a>
        </div>

      </div><!-- /body-content -->

      <!-- FOOTER -->
      <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#352d17" style="background-color:#352d17;">
        <tr><td class="footer" style="background-color:#352d17;">
          <div class="footer-divider"></div>
          <div class="footer-text">
            Matcha On Ice &middot; ${emailCity}<br/>
            <a href="mailto:contact@matchaonice.com">contact@matchaonice.com</a>
          </div>
        </td></tr>
      </table>

    </div><!-- /email-container -->
  </div><!-- /email-wrapper -->
</body>
</html>`;
}

export async function sendReissuedTicketEmail(params: {
  ticket: any;
  event: any;
}): Promise<TicketEmailResult> {
  const { ticket, event } = params;
  const attemptAt = new Date();
  await recordTicketEmailDelivery(ticket?.id, {
    emailDeliveryStatus: "pending",
    emailDeliveryError: null,
    emailLastAttemptAt: attemptAt,
    emailSentAt: null,
    emailMessageId: null,
    emailDeliveryProvider: null,
    emailFallbackUsed: false,
    emailPrimaryError: null,
    emailFallbackError: null,
    emailPrimaryMessageId: null,
    emailFallbackMessageId: null,
  });

  try {
    let locationStreet: string | null = null;
    let locationCity: string | null = null;
    let locationZip: string | null = null;
    let observations: string | null = null;
    if (event?.date && event.date !== "TBD") {
      try {
        const { storage } = await import("./storage");
        const eventDateNames = await storage.listEventDateNames();
        const mapping = eventDateNames.find((edn: any) => edn.eventDate === event.date);
        if (mapping) {
          locationStreet = mapping.locationStreet;
          locationCity = mapping.locationCity;
          locationZip = mapping.locationZip;
          observations = mapping.observations;
        }
      } catch {}
    }

    const reissueEventName = ticket.ticketType === "General" && event?.date
      ? `${event.date} · GA Ticket`
      : event?.name || "Matcha On Ice Event";

    const reissueEventForPdf = event ? { ...event, name: reissueEventName, observations } : event;
    const pdfBuffer = await generateTicketPDF(ticket, reissueEventForPdf, { locationStreet, locationCity, locationZip });
    const pdfFilename = `ticket-${ticket.ticketUrl}.pdf`;

    const baseHtml = buildTicketEmailHtml({
      name: ticket.purchaserName,
      eventName: reissueEventName,
      eventDate: event?.date || "TBD",
      eventTime: event?.time || "TBD",
      eventLocation: event?.location || "San Diego, CA",
      ticketType: ticket.ticketType || "General",
      ticketUrl: ticket.ticketUrl,
      isCourtesy: false,
      locationStreet,
      locationCity,
      observations,
      locationZip,
    });

    const reissueBanner = `
<table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color:#7c3400;margin-bottom:0;">
  <tr><td style="padding:14px 24px;text-align:center;">
    <p style="margin:0;font-family:'Jost',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#ffffff;letter-spacing:0.5px;">
      ⚠️ REISSUED TICKET — This is your updated ticket. Please disregard any previous email and use this one for entry.
    </p>
  </td></tr>
</table>`;

    const htmlBody = baseHtml.replace('<div class="email-container">', `<div class="email-container">${reissueBanner}`);

    const email: PreparedTicketEmail = {
      to: ticket.purchaserEmail,
      subject: `[REISSUED] Your ticket for ${reissueEventName} — updated`,
      htmlBody,
      pdfBuffer,
      pdfFilename,
    };
    return await sendPreparedTicketEmail({ ticket, email, attemptAt });
  } catch (err) {
    const error = safeEmailError(err);
    console.error("❌ Failed to prepare reissued ticket email:", error);
    await recordTicketEmailDelivery(ticket?.id, {
      emailDeliveryStatus: "failed",
      emailDeliveryError: error,
      emailLastAttemptAt: attemptAt,
      emailDeliveryProvider: "none",
      emailFallbackUsed: false,
    });
    return { success: false, error, provider: "none", fallbackUsed: false };
  }
}

export async function sendTicketEmail(params: {
  ticket: any;
  event: any;
  isCourtesy?: boolean;
  preferredProvider?: "auto" | "resend";
}): Promise<TicketEmailResult> {
  const { ticket, event, isCourtesy = false, preferredProvider = "auto" } = params;
  const attemptAt = new Date();
  await recordTicketEmailDelivery(ticket?.id, {
    emailDeliveryStatus: "pending",
    emailDeliveryError: null,
    emailLastAttemptAt: attemptAt,
    emailSentAt: null,
    emailMessageId: null,
    emailDeliveryProvider: null,
    emailFallbackUsed: false,
    emailPrimaryError: null,
    emailFallbackError: null,
    emailPrimaryMessageId: null,
    emailFallbackMessageId: null,
  });

  try {
    let locationStreet: string | null = null;
    let locationCity: string | null = null;
    let locationZip: string | null = null;
    let observations: string | null = null;
    if (event?.date && event.date !== "TBD") {
      try {
        const { storage } = await import("./storage");
        const eventDateNames = await storage.listEventDateNames();
        const mapping = eventDateNames.find((edn: any) => edn.eventDate === event.date);
        if (mapping) {
          locationStreet = mapping.locationStreet;
          locationCity = mapping.locationCity;
          locationZip = mapping.locationZip;
          observations = mapping.observations;
        }
      } catch {}
    }

    const confirmEventName = ticket.ticketType === "General" && event?.date
      ? `${event.date} · GA Ticket`
      : event?.name || "Matcha On Ice Event";

    const confirmEventForPdf = event ? { ...event, name: confirmEventName, observations } : event;
    const pdfBuffer = await generateTicketPDF(ticket, confirmEventForPdf, { locationStreet, locationCity, locationZip });
    const pdfFilename = `ticket-${ticket.ticketUrl}.pdf`;

    const htmlBody = buildTicketEmailHtml({
      name: ticket.purchaserName,
      eventName: confirmEventName,
      eventDate: event?.date || "TBD",
      eventTime: event?.time || "TBD",
      eventLocation: event?.location || "San Diego, CA",
      ticketType: ticket.ticketType || "General",
      ticketUrl: ticket.ticketUrl,
      isCourtesy,
      locationStreet,
      locationCity,
      locationZip,
      observations,
    });

    const email: PreparedTicketEmail = {
      to: ticket.purchaserEmail,
      subject: `Your ticket for ${confirmEventName} is confirmed!`,
      htmlBody,
      pdfBuffer,
      pdfFilename,
    };
    return await sendPreparedTicketEmail({ ticket, email, attemptAt, preferredProvider });
  } catch (err) {
    const error = safeEmailError(err);
    console.error("❌ Failed to prepare ticket email:", error);
    await recordTicketEmailDelivery(ticket?.id, {
      emailDeliveryStatus: "failed",
      emailDeliveryError: error,
      emailLastAttemptAt: attemptAt,
      emailDeliveryProvider: "none",
      emailFallbackUsed: false,
    });
    return { success: false, error, provider: "none", fallbackUsed: false };
  }
}

export async function checkGmailConnection(): Promise<{
  connected: boolean;
  senderEmail?: string;
  error?: string;
}> {
  try {
    const gmail = await getUncachableGmailClient();
    try {
      const profile = await gmail.users.getProfile({ userId: "me" });
      return {
        connected: true,
        senderEmail: profile.data.emailAddress || getSenderEmail(),
      };
    } catch (error) {
      const safeError = safeEmailError(error);
      if (/insufficient permission/i.test(safeError)) {
        return { connected: true, senderEmail: getSenderEmail() };
      }
      throw error;
    }
  } catch (error) {
    return { connected: false, error: safeEmailError(error) };
  }
}

export function checkResendConfiguration(): {
  configured: boolean;
  senderEmail: string | null;
} {
  return {
    configured: Boolean(process.env.RESEND_API_KEY),
    senderEmail: process.env.RESEND_API_KEY ? getResendSenderEmail() : null,
  };
}