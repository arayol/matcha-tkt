import * as XLSX from "xlsx";

export interface ParsedContactRow {
  rowNumber: number;
  name: string;
  email: string;
  valid: boolean;
  reason?: string;
}

export interface ExcelParseResult {
  rows: ParsedContactRow[];
  validCount: number;
  invalidCount: number;
  totalRows: number;
  detectedNameColumn?: string;
  detectedEmailColumn?: string;
}

export class ExcelParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExcelParseError";
  }
}

export function assertXlsxFilename(filename: string) {
  if (!filename.toLowerCase().endsWith(".xlsx")) {
    throw new ExcelParseError("Only .xlsx files are accepted. Re-export your contact list as .xlsx and try again.");
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_KEYS = ["name", "nome", "full name", "fullname", "contact", "contact name", "first name", "first"];
const EMAIL_KEYS = ["email", "e-mail", "mail", "email address", "correo"];

function pickColumn(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => String(h || "").trim().toLowerCase());
  for (const cand of candidates) {
    const idx = norm.indexOf(cand);
    if (idx !== -1) return idx;
  }
  for (const cand of candidates) {
    const idx = norm.findIndex((h) => h.includes(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseExcelBuffer(buf: Buffer): ExcelParseResult {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new ExcelParseError("The spreadsheet has no sheets.");
  }
  const sheet = wb.Sheets[sheetName];
  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  if (data.length < 1) {
    throw new ExcelParseError("The spreadsheet is empty.");
  }

  const headers = (data[0] as any[]).map((h) => String(h || ""));
  const nameIdx = pickColumn(headers, NAME_KEYS);
  const emailIdx = pickColumn(headers, EMAIL_KEYS);

  if (nameIdx === -1 || emailIdx === -1) {
    const missing: string[] = [];
    if (nameIdx === -1) missing.push("a 'name' column");
    if (emailIdx === -1) missing.push("an 'email' column");
    throw new ExcelParseError(
      `Could not find ${missing.join(" and ")} in the header row. The first row must include columns named name and email.`,
    );
  }

  const startRow = 1;

  const rows: ParsedContactRow[] = [];
  const seenEmails = new Set<string>();
  let validCount = 0;
  let invalidCount = 0;

  for (let i = startRow; i < data.length; i++) {
    const row = data[i] as any[];
    if (!row || row.every((c) => String(c || "").trim() === "")) continue;

    const rawName = String(row[nameIdx] ?? "").trim();
    const rawEmail = String(row[emailIdx] ?? "").trim().toLowerCase();

    let valid = true;
    let reason: string | undefined;

    if (!rawEmail) {
      valid = false;
      reason = "Missing email";
    } else if (!EMAIL_RE.test(rawEmail)) {
      valid = false;
      reason = "Invalid email format";
    } else if (seenEmails.has(rawEmail)) {
      valid = false;
      reason = "Duplicate in file";
    }

    if (valid) {
      seenEmails.add(rawEmail);
      validCount++;
    } else {
      invalidCount++;
    }

    rows.push({
      rowNumber: i + 1,
      name: rawName || rawEmail,
      email: rawEmail,
      valid,
      reason,
    });
  }

  return {
    rows,
    validCount,
    invalidCount,
    totalRows: rows.length,
    detectedNameColumn: headers[nameIdx],
    detectedEmailColumn: headers[emailIdx],
  };
}
