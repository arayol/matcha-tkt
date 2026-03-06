// Gmail integration via Replit connector (google-mail OAuth)
// Uses getUncachableGmailClient() — never cache, tokens expire
import { google } from "googleapis";
import { generateTicketPDF } from "./pdfGenerator";

let connectionSettings: any;

async function getAccessToken() {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

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
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-mail",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
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
}) {
  const boundary = `MOI_${Date.now()}`;

  const lines: string[] = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    params.htmlBody,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${params.pdfFilename}"`,
    `Content-Disposition: attachment; filename="${params.pdfFilename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    params.pdfBuffer.toString("base64"),
    ``,
    `--${boundary}--`,
  ];

  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
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
}) {
  const baseUrl = process.env.REPL_SLUG
    ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : "http://localhost:5000";

  const fullTicketUrl = `${baseUrl}/ticket/${params.ticketUrl}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f4f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c5cbf 0%,#9b7de8 100%);padding:36px 40px;text-align:center;">
            <div style="font-size:32px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Matcha On Ice</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:6px;">San Diego, CA</div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 8px;font-size:16px;color:#6b7280;">Hello,</p>
            <h1 style="margin:0 0 24px;font-size:26px;font-weight:700;color:#1a1a2e;line-height:1.2;">
              Your ticket is confirmed${params.isCourtesy ? " (Courtesy)" : ""}! 🎉
            </h1>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f7fc;border-radius:16px;padding:24px;margin-bottom:28px;">
              <tr><td style="padding-bottom:14px;border-bottom:1px dashed #e0d9f5;">
                <div style="font-size:11px;font-weight:600;color:#9b7de8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Event</div>
                <div style="font-size:17px;font-weight:600;color:#1a1a2e;">${params.eventName}</div>
              </td></tr>
              <tr><td style="padding:14px 0;border-bottom:1px dashed #e0d9f5;">
                <table width="100%"><tr>
                  <td width="50%">
                    <div style="font-size:11px;font-weight:600;color:#9b7de8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Date</div>
                    <div style="font-size:15px;font-weight:500;color:#1a1a2e;">${params.eventDate}</div>
                  </td>
                  <td width="50%">
                    <div style="font-size:11px;font-weight:600;color:#9b7de8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Time</div>
                    <div style="font-size:15px;font-weight:500;color:#1a1a2e;">${params.eventTime}</div>
                  </td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:14px 0;border-bottom:1px dashed #e0d9f5;">
                <div style="font-size:11px;font-weight:600;color:#9b7de8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Location</div>
                <div style="font-size:15px;font-weight:500;color:#1a1a2e;">${params.eventLocation}</div>
              </td></tr>
              <tr><td style="padding-top:14px;">
                <div style="font-size:11px;font-weight:600;color:#9b7de8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Ticket Type</div>
                <div style="display:inline-block;background:#ede9f8;color:#7c5cbf;font-size:13px;font-weight:600;padding:4px 14px;border-radius:20px;">${params.ticketType}</div>
              </td></tr>
            </table>

            <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
              Your ticket PDF is attached to this email. You can also view it online anytime:
            </p>

            <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
              <a href="${fullTicketUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c5cbf 0%,#9b7de8 100%);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:14px;box-shadow:0 4px 14px rgba(124,92,191,0.35);">
                View My Ticket
              </a>
            </td></tr></table>

            <p style="margin:28px 0 0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
              Show the QR code at the entrance for quick check-in.<br>
              Questions? Reply to this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f7fc;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">Matcha On Ice &middot; San Diego, CA</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendTicketEmail(params: {
  ticket: any;
  event: any;
  isCourtesy?: boolean;
}) {
  const { ticket, event, isCourtesy = false } = params;

  try {
    const gmail = await getUncachableGmailClient();

    const senderEmail = getSenderEmail();
    const fromHeader = `Matcha On Ice <${senderEmail}>`;

    const pdfBuffer = await generateTicketPDF(ticket, event);
    const pdfFilename = `ticket-${ticket.ticketUrl}.pdf`;

    const htmlBody = buildTicketEmailHtml({
      name: ticket.purchaserName,
      eventName: event?.name || "Matcha On Ice Event",
      eventDate: event?.date || "TBD",
      eventTime: event?.time || "TBD",
      eventLocation: event?.location || "San Diego, CA",
      ticketType: ticket.ticketType || "General",
      ticketUrl: ticket.ticketUrl,
      isCourtesy,
    });

    const rawMessage = makeRfc2822({
      to: ticket.purchaserEmail,
      from: fromHeader,
      subject: `Your ticket for ${event?.name || "Matcha On Ice"} is confirmed!`,
      htmlBody,
      pdfBuffer,
      pdfFilename,
    });

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawMessage },
    });

    console.log(`📧 Ticket email sent to ${ticket.purchaserEmail} for ticket ${ticket.id}`);
    return true;
  } catch (err) {
    console.error("❌ Failed to send ticket email:", err);
    return false;
  }
}
