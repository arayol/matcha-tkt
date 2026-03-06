import QRCode from "qrcode";
import { randomBytes } from "crypto";

export function generateQrData(ticketId: string): string {
  const hash = randomBytes(6).toString("hex");
  return `MOI-${ticketId}-${hash}`;
}

export function generateUrlSlug(): string {
  return randomBytes(8).toString("hex");
}

export async function generateQrCodeBase64(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    width: 400,
    margin: 2,
    color: { dark: "#1f2937", light: "#ffffff" },
    errorCorrectionLevel: "H",
  });
}

export async function generateTicketQR(ticketId: string) {
  const qrData = generateQrData(ticketId);
  const qrCode = await generateQrCodeBase64(qrData);
  const ticketUrl = generateUrlSlug();

  return { qrData, qrCode, ticketUrl };
}
