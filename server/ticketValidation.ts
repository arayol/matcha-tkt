export interface TicketValidationResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Validates whether a ticket is ready to be delivered to the customer.
 *
 * Rules:
 *  1. purchaserName  — must be non-empty
 *  2. eventDate      — must not be empty or "TBD"
 *  3. Location       — must contain a street number (digit) in locationStreet
 *                      (from event_date_names) or as fallback in eventLocation.
 *                      Plain "City, State" strings that have no digit fail.
 */
export function validateTicketBeforeSend(params: {
  purchaserName: string;
  eventDate: string;
  locationStreet?: string | null;
  eventLocation?: string | null;
}): TicketValidationResult {
  const reasons: string[] = [];

  if (!params.purchaserName || !params.purchaserName.trim()) {
    reasons.push("Purchaser name is empty");
  }

  const date = (params.eventDate || "").trim();
  if (!date || date.toUpperCase() === "TBD") {
    reasons.push("Event date is TBD or missing");
  }

  const street = (params.locationStreet || "").trim();
  const fallback = (params.eventLocation || "").trim();
  const hasStreetNumber = (street && /\d/.test(street)) || (fallback && /\d/.test(fallback));
  if (!hasStreetNumber) {
    reasons.push("Location is missing street address and number");
  }

  return { valid: reasons.length === 0, reasons };
}
