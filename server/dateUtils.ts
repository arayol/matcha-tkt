// Utility for parsing fuzzy human-readable event date strings like "Feb 26th", "Jun 27th"
// into actual Date objects, with optional purchase-date hinting to determine the correct year.

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/**
 * Parse a fuzzy event date string (e.g. "Feb 26th", "Jun 27th") into a Date.
 *
 * hintDate (optional): the ticket purchase date. Since tickets are bought BEFORE
 * the event (typically 0–150 days before), we find the year that places the parsed
 * date 0–150 days AFTER the hint. This lets us distinguish "Jun 2025" (past) from
 * "Jun 2026" (upcoming) when both would otherwise be ambiguous.
 *
 * Without a hint we fall back to current year:
 *   - If current-year date is in the past  → return it (archived)
 *   - If current-year date is in the future → return it (not yet archived)
 *
 * Returns null if the string cannot be parsed.
 */
export function parseFuzzyEventDate(dateStr: string, hintDate?: Date): Date | null {
  if (!dateStr || dateStr === "TBD") return null;

  const match = dateStr.match(/^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s|$)/i);
  if (!match) return null;

  const monthStr = match[1].toLowerCase();
  const day = parseInt(match[2], 10);
  const monthIdx = MONTHS[monthStr] ?? MONTHS[monthStr.slice(0, 3)];
  if (monthIdx === undefined || isNaN(day) || day < 1 || day > 31) return null;

  if (hintDate) {
    const hintYear = hintDate.getFullYear();
    // Tickets are purchased 0–150 days before the event
    for (const yr of [hintYear, hintYear + 1, hintYear - 1]) {
      const candidate = new Date(yr, monthIdx, day);
      const msAfterHint = candidate.getTime() - hintDate.getTime();
      const daysAfterHint = msAfterHint / (24 * 60 * 60 * 1000);
      if (daysAfterHint >= 0 && daysAfterHint <= 150) {
        return candidate;
      }
    }
    // Broader fallback: pick the year closest in time to the hint
    const candidates = [hintYear - 1, hintYear, hintYear + 1]
      .map(yr => new Date(yr, monthIdx, day))
      .sort((a, b) => Math.abs(a.getTime() - hintDate.getTime()) - Math.abs(b.getTime() - hintDate.getTime()));
    return candidates[0];
  }

  // No hint: use current year (past → archived, future → not yet archived)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(today.getFullYear(), monthIdx, day);
}
