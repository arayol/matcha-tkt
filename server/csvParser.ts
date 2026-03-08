import { parse } from "csv-parse/sync";

export interface ParsedCsvRow {
  orderNumber: string;
  email: string;
  billingName: string;
  phone: string;
  orderStatus: string;
  createdAt: string;
  productRaw: string;
  parsedEventDate: string;
  parsedEventTime: string;
  parsedEventType: string;
  parsedTicketType: string;
  parsedClassName: string;
  skus: string;
  price: string;
  quantity: number;
  currency: string;
  subtotal: string;
  shipping: string;
  taxes: string;
  discountCode: string;
  discountAmount: string;
  giftCard: string;
  streetAddress: string;
  city: string;
  state: string;
  postal: string;
  paymentMethod: string;
  notes: string;
  orderType: "ticket" | "vendor";
}

export interface DuplicateWarning {
  orderNumber: string;
  reason: string;
  existingSource: "csv" | "database";
}

export interface ParseResult {
  rows: ParsedCsvRow[];
  duplicatesInCsv: DuplicateWarning[];
  totalParsed: number;
}

const VENDOR_KEYWORDS = ["vendor", "expositor", "booth", "stand", "espaço", "espaco"];

function parseProductField(product: string): {
  eventDate: string;
  eventTime: string;
  eventType: string;
  ticketType: string;
  className: string;
  orderType: "ticket" | "vendor";
} {
  const result = {
    eventDate: "",
    eventTime: "",
    eventType: "",
    ticketType: "",
    className: "",
    orderType: "ticket" as "ticket" | "vendor",
  };

  if (!product) return result;

  const isVendor = VENDOR_KEYWORDS.some(kw => product.toLowerCase().includes(kw));
  result.orderType = isVendor ? "vendor" : "ticket";

  if (isVendor) {
    result.ticketType = "Vendor";
    result.eventType = "Vendor";
    const dateMatch = product.match(/(\w+\s+\d{1,2}(?:st|nd|rd|th)?)/i);
    if (dateMatch) result.eventDate = dateMatch[1].trim();
    return result;
  }

  const commaIdx = product.indexOf(",");
  if (commaIdx === -1) {
    result.className = product;
    return result;
  }

  result.eventDate = product.substring(0, commaIdx).trim();

  const afterComma = product.substring(commaIdx + 1).trim();

  const membersMatch = afterComma.match(/^(.+?)\s*[-–]\s*Members Event Ticket$/i);
  if (membersMatch) {
    result.eventTime = membersMatch[1].trim();
    result.eventType = "Members Event";
    result.ticketType = "Members Event Ticket";
    return result;
  }

  const membersSimple = afterComma.match(/^(.+?)\s+Members Event Ticket$/i);
  if (membersSimple) {
    result.eventTime = membersSimple[1].trim();
    result.eventType = "Members Event";
    result.ticketType = "Members Event Ticket";
    return result;
  }

  const etMatch = afterComma.match(/^(.+?)\s+Event Ticket\s*[-–]\s*(.+)$/i);
  if (etMatch) {
    result.eventTime = etMatch[1].trim();
    result.eventType = "Event Ticket";
    const afterET = etMatch[2].trim();

    if (/general\s+admission/i.test(afterET)) {
      result.ticketType = "General Admission Ticket";
    } else if (/class/i.test(afterET)) {
      result.ticketType = "Class Ticket";
      result.className = afterET;
    } else {
      result.ticketType = afterET;
    }
    return result;
  }

  const etSimple = afterComma.match(/^(.+?)\s+Event Ticket$/i);
  if (etSimple) {
    result.eventTime = etSimple[1].trim();
    result.eventType = "Event Ticket";
    result.ticketType = "General Admission Ticket";
    return result;
  }

  const timeMatch = afterComma.match(/^(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?(?:\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)?)/i);
  if (timeMatch) {
    result.eventTime = timeMatch[1].trim();
    result.eventType = "Event Ticket";
    const remaining = afterComma.substring(timeMatch[0].length).replace(/^\s*[-–]\s*/, "").trim();
    if (remaining) {
      if (/general\s+admission/i.test(remaining)) {
        result.ticketType = "General Admission Ticket";
      } else if (/class/i.test(remaining)) {
        result.ticketType = "Class Ticket";
        result.className = remaining;
      } else if (/members?\s+event/i.test(remaining)) {
        result.eventType = "Members Event";
        result.ticketType = "Members Event Ticket";
      } else {
        result.ticketType = remaining;
      }
    } else {
      result.ticketType = "General Admission Ticket";
    }
  }

  return result;
}

const COLUMN_MAP: Record<string, string> = {
  "order number": "orderNumber",
  "order_number": "orderNumber",
  "ordernumber": "orderNumber",
  "order #": "orderNumber",
  "order no": "orderNumber",
  "email": "email",
  "e-mail": "email",
  "billing email": "email",
  "billing name": "billingName",
  "billing_name": "billingName",
  "billingname": "billingName",
  "name": "billingName",
  "customer name": "billingName",
  "customer": "billingName",
  "phone": "phone",
  "billing phone": "phone",
  "billing_phone": "phone",
  "billingphone": "phone",
  "phone number": "phone",
  "telephone": "phone",
  "tel": "phone",
  "status": "orderStatus",
  "order status": "orderStatus",
  "created": "createdAt",
  "date": "createdAt",
  "order date": "createdAt",
  "created at": "createdAt",
  "product": "productRaw",
  "product name": "productRaw",
  "product names": "productRaw",
  "products": "productRaw",
  "item": "productRaw",
  "item name": "productRaw",
  "skus": "skus",
  "sku": "skus",
  "price": "price",
  "unit price": "price",
  "item price": "price",
  "quantity": "quantity",
  "qty": "quantity",
  "currency": "currency",
  "subtotal": "subtotal",
  "sub total": "subtotal",
  "sub-total": "subtotal",
  "total": "subtotal",
  "amount": "subtotal",
  "shipping": "shipping",
  "taxes": "taxes",
  "tax": "taxes",
  "discount code": "discountCode",
  "discount_code": "discountCode",
  "discountcode": "discountCode",
  "coupon": "discountCode",
  "coupon code": "discountCode",
  "promo code": "discountCode",
  "discount": "discountCode",
  "discount amount": "discountAmount",
  "gift card": "giftCard",
  "gift_card": "giftCard",
  "giftcard": "giftCard",
  "street address": "streetAddress",
  "street_address": "streetAddress",
  "streetaddress": "streetAddress",
  "address": "streetAddress",
  "billing address": "streetAddress",
  "city": "city",
  "state": "state",
  "province": "state",
  "region": "state",
  "postal": "postal",
  "zip": "postal",
  "zip code": "postal",
  "postal code": "postal",
  "payment method": "paymentMethod",
  "payment_method": "paymentMethod",
  "paymentmethod": "paymentMethod",
  "payment type": "paymentMethod",
  "notes": "notes",
  "note": "notes",
  "order notes": "notes",
};

function normalizeColumnName(col: string): string {
  const lower = col.toLowerCase().trim();
  return COLUMN_MAP[lower] || lower;
}

export function parseCsvContent(csvContent: string): ParseResult {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  const rows: ParsedCsvRow[] = [];
  const seenOrders = new Set<string>();
  const duplicatesInCsv: DuplicateWarning[] = [];

  for (const record of records) {
    const normalized: Record<string, any> = {};
    for (const [key, value] of Object.entries(record)) {
      const mappedKey = normalizeColumnName(key);
      normalized[mappedKey] = value;
    }

    const orderNumber = String(normalized.orderNumber || "").trim();

    if (!orderNumber) continue;

    if (seenOrders.has(orderNumber)) {
      duplicatesInCsv.push({
        orderNumber,
        reason: "Duplicate order number within CSV file",
        existingSource: "csv",
      });
      continue;
    }

    seenOrders.add(orderNumber);

    const productRaw = String(normalized.productRaw || "");
    const parsed = parseProductField(productRaw);

    const row: ParsedCsvRow = {
      orderNumber,
      email: String(normalized.email || "").trim(),
      billingName: String(normalized.billingName || "").trim(),
      phone: String(normalized.phone || "").trim(),
      orderStatus: String(normalized.orderStatus || "").trim(),
      createdAt: String(normalized.createdAt || "").trim(),
      productRaw,
      parsedEventDate: parsed.eventDate,
      parsedEventTime: parsed.eventTime,
      parsedEventType: parsed.eventType,
      parsedTicketType: parsed.ticketType,
      parsedClassName: parsed.className,
      skus: String(normalized.skus || "").trim(),
      price: String(normalized.price || "").trim(),
      quantity: parseInt(String(normalized.quantity || "1"), 10) || 1,
      currency: String(normalized.currency || "").trim(),
      subtotal: String(normalized.subtotal || "").trim(),
      shipping: String(normalized.shipping || "").trim(),
      taxes: String(normalized.taxes || "").trim(),
      discountCode: String(normalized.discountCode || "").trim(),
      discountAmount: String(normalized.discountAmount || "").trim(),
      giftCard: String(normalized.giftCard || "").trim(),
      streetAddress: String(normalized.streetAddress || "").trim(),
      city: String(normalized.city || "").trim(),
      state: String(normalized.state || "").trim(),
      postal: String(normalized.postal || "").trim(),
      paymentMethod: String(normalized.paymentMethod || "").trim(),
      notes: String(normalized.notes || "").trim(),
      orderType: parsed.orderType,
    };

    rows.push(row);
  }

  return {
    rows,
    duplicatesInCsv,
    totalParsed: rows.length,
  };
}

export function checkDatabaseDuplicates(
  csvRows: ParsedCsvRow[],
  existingOrderNumbers: Set<string>
): DuplicateWarning[] {
  const dbDuplicates: DuplicateWarning[] = [];

  for (const row of csvRows) {
    if (row.orderNumber && existingOrderNumbers.has(row.orderNumber)) {
      dbDuplicates.push({
        orderNumber: row.orderNumber,
        reason: "Order number already exists in database",
        existingSource: "database",
      });
    }
  }

  return dbDuplicates;
}
