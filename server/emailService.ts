// Gmail integration via Replit connector (google-mail OAuth)
// Uses getUncachableGmailClient() — never cache, tokens expire
import { google } from "googleapis";
import { generateTicketPDF } from "./pdfGenerator";
import * as fs from "fs";
import * as path from "path";

const LOGO_DATA_URI = (() => {
  try {
    const logoPath = path.join(process.cwd(), "server", "matcha-logo.png");
    const buf = fs.readFileSync(logoPath);
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
})();

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
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPL_SLUG
    ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : "http://localhost:5000";

  const fullTicketUrl = `${baseUrl}/ticket/${params.ticketUrl}`;
  const firstName = params.name.split(" ")[0];

  const logoImg = LOGO_DATA_URI
    ? `<img src="${LOGO_DATA_URI}" alt="Matcha On Ice Social Club" style="width:220px;max-width:100%;filter:invert(1) brightness(2);position:relative;z-index:1;" />`
    : `<div style="font-family:'Georgia',serif;font-size:28px;color:#fff;font-weight:300;letter-spacing:1px;"><em>Matcha</em> On Ice<div style="font-size:12px;letter-spacing:4px;font-weight:300;margin-top:4px;opacity:0.6;">SOCIAL CLUB</div></div>`;

  const logoFooterImg = LOGO_DATA_URI
    ? `<img src="${LOGO_DATA_URI}" alt="Matcha On Ice" style="width:160px;filter:invert(1) brightness(2);opacity:0.7;margin-bottom:20px;" />`
    : `<div style="font-family:'Georgia',serif;font-size:20px;color:rgba(255,255,255,0.6);font-weight:300;margin-bottom:16px;"><em>Matcha</em> On Ice</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Ticket is Confirmed – Matcha On Ice</title>
</head>
<body style="margin:0;padding:0;background-color:#f0ede6;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#2a2520;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0ede6;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#faf9f6;border-radius:2px;overflow:hidden;box-shadow:0 4px 40px rgba(42,37,32,0.10);">

        <!-- HEADER -->
        <tr>
          <td style="background-color:#2a2520;padding:48px 48px 40px;text-align:center;">
            ${logoImg}
            <div style="width:40px;height:1px;background:rgba(122,153,86,0.6);margin:24px auto 0;"></div>
          </td>
        </tr>

        <!-- HERO BAND -->
        <tr>
          <td style="background:linear-gradient(135deg,#7a9956 0%,#5c7a3e 100%);padding:32px 48px;text-align:center;">
            <div style="font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:10px;">Booking Confirmed</div>
            <div style="font-family:Georgia,serif;font-size:38px;font-weight:300;color:#ffffff;line-height:1.1;letter-spacing:0.5px;">Your ticket is<br><em>confirmed.</em></div>
            <div style="width:44px;height:44px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.5);display:inline-block;margin:16px auto 0;line-height:44px;text-align:center;">
              <span style="color:#fff;font-size:18px;">&#10003;</span>
            </div>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="padding:48px 48px 0;text-align:center;">

            <div style="font-family:Georgia,serif;font-size:22px;font-weight:300;color:#2a2520;margin-bottom:6px;text-align:center;">Hello, ${firstName},</div>
            <div style="display:block;font-size:13px;font-weight:400;letter-spacing:1.5px;text-transform:uppercase;color:#7a9956;margin-bottom:32px;border-bottom:1px solid #d5cfc4;padding-bottom:20px;text-align:center;">${params.eventName}</div>

            <!-- TICKET CARD -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#2a2520;border-radius:2px;overflow:hidden;margin-bottom:36px;border-top:3px solid #7a9956;">
              <tr>
                <td style="padding:28px 32px 20px;border-bottom:1px dashed rgba(255,255,255,0.1);">
                  <div style="font-family:Georgia,serif;font-size:26px;font-weight:400;color:#ffffff;letter-spacing:0.3px;line-height:1.2;text-align:center;">${params.eventName}</div>
                  <div style="text-align:center;margin-top:10px;">
                    <span style="display:inline-block;padding:4px 14px;background:rgba(122,153,86,0.2);border:1px solid rgba(122,153,86,0.4);border-radius:20px;font-size:11px;font-weight:500;letter-spacing:1.5px;text-transform:uppercase;color:#a3bf7a;">${params.ticketType}</span>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 32px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="33%" style="padding-right:16px;vertical-align:top;text-align:center;">
                        <div style="font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:6px;">Date</div>
                        <div style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#ffffff;line-height:1.2;">${params.eventDate}</div>
                      </td>
                      <td width="33%" style="padding-right:16px;vertical-align:top;text-align:center;">
                        <div style="font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:6px;">Time</div>
                        <div style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#ffffff;line-height:1.2;">${params.eventTime}</div>
                      </td>
                      <td width="33%" style="vertical-align:top;text-align:center;">
                        <div style="font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.35);margin-bottom:6px;">Location</div>
                        <div style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#ffffff;line-height:1.2;">${params.eventLocation}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="background:rgba(0,0,0,0.2);padding:16px 32px;text-align:center;">
                  <div style="font-size:12px;font-weight:300;color:rgba(255,255,255,0.45);line-height:1.5;">
                    Your QR code is attached to this email as a PDF ticket.<br>
                    Present it at the entrance for quick check-in.
                  </div>
                </td>
              </tr>
            </table>

            <!-- INSTRUCTIONS -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:36px;">
              <tr><td style="padding:16px 0;border-top:1px solid #ede8df;border-bottom:1px solid #ede8df;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="width:28px;height:28px;border-radius:50%;border:1px solid #7a9956;text-align:center;vertical-align:middle;font-size:11px;font-weight:600;color:#7a9956;padding:0 8px;">1</td>
                  <td style="padding-left:16px;font-size:14px;font-weight:300;color:#5a5248;line-height:1.6;"><strong style="font-weight:500;color:#2a2520;">Save your ticket.</strong> Your ticket PDF is attached to this email. You can also view it online anytime by clicking the button below.</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:16px 0;border-bottom:1px solid #ede8df;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="width:28px;height:28px;border-radius:50%;border:1px solid #7a9956;text-align:center;vertical-align:middle;font-size:11px;font-weight:600;color:#7a9956;padding:0 8px;">2</td>
                  <td style="padding-left:16px;font-size:14px;font-weight:300;color:#5a5248;line-height:1.6;"><strong style="font-weight:500;color:#2a2520;">Show your QR code at the door.</strong> Our team will scan it at the entrance for quick and seamless check-in.</td>
                </tr></table>
              </td></tr>
              <tr><td style="padding:16px 0;border-bottom:1px solid #ede8df;">
                <table cellpadding="0" cellspacing="0"><tr>
                  <td style="width:28px;height:28px;border-radius:50%;border:1px solid #7a9956;text-align:center;vertical-align:middle;font-size:11px;font-weight:600;color:#7a9956;padding:0 8px;">3</td>
                  <td style="padding-left:16px;font-size:14px;font-weight:300;color:#5a5248;line-height:1.6;"><strong style="font-weight:500;color:#2a2520;">Questions?</strong> Simply reply to this email and we'll be happy to help.</td>
                </tr></table>
              </td></tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="padding:8px 0 36px;">
              <tr><td align="center">
                <a href="${fullTicketUrl}" style="display:inline-block;padding:14px 40px;background:#7a9956;color:#ffffff;text-decoration:none;font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;border-radius:1px;">View My Ticket</a>
              </td></tr>
            </table>

          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#2a2520;padding:36px 48px;text-align:center;">
            ${logoFooterImg}
            <div style="width:30px;height:1px;background:rgba(122,153,86,0.3);margin:16px auto;"></div>
            <div style="font-size:12px;font-weight:300;color:rgba(255,255,255,0.4);line-height:1.8;">
              Matcha On Ice &middot; San Diego, CA<br/>
              <a href="mailto:contact@matchaonice.com" style="color:rgba(163,191,122,0.8);text-decoration:none;">contact@matchaonice.com</a>
            </div>
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
