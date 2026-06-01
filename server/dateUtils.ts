// Utility for parsing fuzzy human-readable event date strings like "Feb 26th", "Jun 27th"
// into actual Date objects, with optional purchase-date hinting to determine the correct year.

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

const FULL_MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Resolve a lowercased token to a month index, or undefined if it isn't a month.
 * Accepts exact matches (abbreviations and full names) and genuine prefixes of a
 * full month name (e.g. "sept" → September), but rejects arbitrary words that
 * merely share a 3-letter prefix with a month (e.g. "mayhem").
 */
function monthIndexFromToken(token: string): number | undefined {
  const exact = MONTHS[token];
  if (exact !== undefined) return exact;
  const abbrIdx = MONTHS[token.slice(0, 3)];
  if (abbrIdx !== undefined && FULL_MONTH_NAMES[abbrIdx].startsWith(token)) return abbrIdx;
  return undefined;
}

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

  // Scan the whole string for the first "<month> <day>" pair. This tolerates a
  // leading location prefix (e.g. "LA | May 2nd") and trailing time text
  // (e.g. "Mar 28th, 11 AM"), unlike a start-anchored match.
  let monthIdx: number | undefined;
  let day = NaN;
  const re = /([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dateStr)) !== null) {
    const idx = monthIndexFromToken(m[1].toLowerCase());
    if (idx === undefined) continue;
    const d = parseInt(m[2], 10);
    if (isNaN(d) || d < 1 || d > 31) continue;
    monthIdx = idx;
    day = d;
    break;
  }
  if (monthIdx === undefined || isNaN(day)) return null;

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

/**
 * Resolve an event's effective calendar date for archival decisions.
 * Priority: explicit calendarDate → admin-confirmed event_date_names mapping →
 * the event's own fuzzy date string (e.g. "LA | May 2nd"). hintDate (typically
 * the earliest linked ticket's purchase date) anchors the year for the fallback.
 * Returns null when no usable date can be derived (e.g. "TBD").
 */
export function resolveEventCalendarDate(
  ev: { calendarDate?: Date | string | null; date?: string | null } | undefined | null,
  dateNameMap: Map<string, { eventDate: string; createdAt?: Date | string | null }>,
  hintDate?: Date,
): Date | null {
  if (!ev) return null;
  if (ev.calendarDate) return new Date(ev.calendarDate);
  if (ev.date) {
    const mapping = dateNameMap.get(ev.date);
    if (mapping) {
      const anchor = mapping.createdAt ? new Date(mapping.createdAt) : undefined;
      const fromMapping = parseFuzzyEventDate(mapping.eventDate, anchor);
      if (fromMapping) return fromMapping;
    }
    const fromOwn = parseFuzzyEventDate(ev.date, hintDate);
    if (fromOwn) return fromOwn;
  }
  return null;
}
