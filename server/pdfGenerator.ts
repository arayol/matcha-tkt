import PDFDocument from "pdfkit";
import type { Ticket, Event } from "@shared/schema";

export async function generateTicketPDF(ticket: Ticket, event: Event | undefined): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", margin: 40 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const purple = "#7c6af4";
    const darkText = "#1a1a2e";
    const mutedText = "#6b7280";
    const lightBg = "#f5f3ff";
    const pageWidth = doc.page.width - 80;

    doc.rect(0, 0, doc.page.width, 80).fill(purple);

    doc.fontSize(22).fillColor("#ffffff").font("Helvetica-Bold")
      .text("MATCHA ON ICE", 40, 22, { align: "center", width: pageWidth });

    doc.fontSize(10).fillColor("rgba(255,255,255,0.8)").font("Helvetica")
      .text("San Diego, CA  ·  Event Ticket", 40, 50, { align: "center", width: pageWidth });

    let y = 100;

    doc.fontSize(14).fillColor(darkText).font("Helvetica-Bold")
      .text(event?.name || "Event Ticket", 40, y, { width: pageWidth });

    y += 22;

    if (event) {
      doc.fontSize(10).fillColor(mutedText).font("Helvetica")
        .text(`${event.date}  ·  ${event.time}  ·  ${event.location}`, 40, y, { width: pageWidth });
      y += 16;
    }

    y += 8;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y)
      .dash(4, { space: 4 }).strokeColor("#e5e7eb").lineWidth(1).stroke().undash();
    y += 16;

    doc.fontSize(11).fillColor(mutedText).font("Helvetica").text("TICKET HOLDER", 40, y);
    y += 16;
    doc.fontSize(16).fillColor(darkText).font("Helvetica-Bold").text(ticket.purchaserName, 40, y);
    y += 24;

    const badgeX = 40;
    const badgeY = y;
    const badgeText = ticket.ticketType || "General";
    const badgeW = doc.widthOfString(badgeText) + 20;
    doc.roundedRect(badgeX, badgeY, badgeW, 22, 6).fill(lightBg);
    doc.fontSize(10).fillColor(purple).font("Helvetica-Bold")
      .text(badgeText, badgeX + 10, badgeY + 6);
    y += 36;

    y += 4;
    doc.moveTo(40, y).lineTo(doc.page.width - 40, y)
      .dash(4, { space: 4 }).strokeColor("#e5e7eb").lineWidth(1).stroke().undash();
    y += 16;

    const qrSize = 160;
    const qrX = (doc.page.width - qrSize) / 2;

    if (ticket.qrCode) {
      try {
        const base64Data = ticket.qrCode.replace(/^data:image\/\w+;base64,/, "");
        const qrBuffer = Buffer.from(base64Data, "base64");
        doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
        y += qrSize + 12;
      } catch {
        doc.fontSize(10).fillColor(mutedText).text("[QR Code unavailable]", 40, y, { align: "center", width: pageWidth });
        y += 24;
      }
    }

    doc.fontSize(8).fillColor(mutedText).font("Helvetica")
      .text(`ID: ${ticket.id.toUpperCase()}`, 40, y, { align: "center", width: pageWidth });
    y += 14;

    doc.fontSize(8).fillColor(mutedText)
      .text("This ticket is valid for one-time entry only. Do not share.", 40, y, { align: "center", width: pageWidth });
    y += 24;

    doc.moveTo(40, y).lineTo(doc.page.width - 40, y)
      .strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    y += 10;

    doc.fontSize(8).fillColor(mutedText).font("Helvetica")
      .text("Matcha On Ice  ·  matchaonice.com", 40, y, { align: "center", width: pageWidth });

    doc.end();
  });
}
