/**
 * One-time DB repair script: Fix wrong Stripe product ID linked to Mat Pilates event
 * on August 16th, and correct tickets for affected customers.
 *
 * Root cause: The Sculpt Class (11:00 AM, Aug 16) Stripe product ID was mistakenly
 * linked to the Mat Pilates (9:30 AM, Aug 16) event due to a non-deterministic sort
 * tiebreaker in resolveEvent. This caused tickets for Sculpt Class purchases to be
 * issued under the Mat Pilates event.
 *
 * Affected customers: Dai Jhun Boyd, Erin McLaren, Erin Sprague
 *
 * Run with: npx tsx scripts/fix-august16-product-link.ts
 */

import { db } from "../server/db";
import { events, tickets } from "../shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const AFFECTED_EMAILS = [
  "dai jhun boyd",
  "erin mclaren",
  "erin sprague",
];

const SCULPT_CLASS_KEYWORDS = ["sculpt", "mallory tosh", "mallory"];
const MAT_PILATES_KEYWORDS = ["mat pilates", "lariza young", "lariza"];
const AUG16_KEYWORDS = ["august 16", "aug 16"];

function isScultpClassEvent(ev: { name: string; eventType: string; time?: string | null }): boolean {
  const combined = `${ev.name} ${ev.eventType} ${ev.time || ""}`.toLowerCase();
  return SCULPT_CLASS_KEYWORDS.some(kw => combined.includes(kw));
}

function isMatPilatesEvent(ev: { name: string; eventType: string; time?: string | null }): boolean {
  const combined = `${ev.name} ${ev.eventType} ${ev.time || ""}`.toLowerCase();
  return MAT_PILATES_KEYWORDS.some(kw => combined.includes(kw));
}

function isAug16Event(ev: { name: string; date: string; calendarDate?: Date | null }): boolean {
  const combined = `${ev.name} ${ev.date}`.toLowerCase();
  const hasKeyword = AUG16_KEYWORDS.some(kw => combined.includes(kw));
  if (hasKeyword) return true;
  if (ev.calendarDate) {
    const d = new Date(ev.calendarDate);
    return d.getMonth() === 7 && d.getDate() === 16; // August = month 7
  }
  return false;
}

async function main() {
  console.log("=".repeat(60));
  console.log("🔧 DB REPAIR: Fix Aug 16 Sculpt Class / Mat Pilates product link");
  console.log("=".repeat(60));
  console.log("");

  // 1. Find all events and locate the two Aug 16 events
  const allEvents = await db.select().from(events);
  console.log(`📋 Total events in DB: ${allEvents.length}`);

  const aug16Events = allEvents.filter(isAug16Event);
  console.log(`\n📅 August 16th events found (${aug16Events.length}):`);
  for (const ev of aug16Events) {
    console.log(`  - [${ev.id}] "${ev.name}" | time=${ev.time} | stripeProductId=${ev.stripeProductId || "(none)"}`);
  }

  const sculptEvent = aug16Events.find(isScultpClassEvent);
  const matPilatesEvent = aug16Events.find(isMatPilatesEvent);

  if (!sculptEvent) {
    console.error("\n❌ Could not find Sculpt Class event on August 16th. Aborting.");
    process.exit(1);
  }
  if (!matPilatesEvent) {
    console.error("\n❌ Could not find Mat Pilates event on August 16th. Aborting.");
    process.exit(1);
  }

  console.log(`\n✅ Sculpt Class event: [${sculptEvent.id}] "${sculptEvent.name}" | time=${sculptEvent.time}`);
  console.log(`   stripeProductId: ${sculptEvent.stripeProductId || "(none)"}`);
  console.log(`✅ Mat Pilates event: [${matPilatesEvent.id}] "${matPilatesEvent.name}" | time=${matPilatesEvent.time}`);
  console.log(`   stripeProductId: ${matPilatesEvent.stripeProductId || "(none)"}`);

  // 2. Check if Mat Pilates is holding a product ID that should belong to Sculpt Class
  // The corruption: Sculpt Class product ID was linked to Mat Pilates
  // We detect this if:
  //   a) Mat Pilates has a stripeProductId AND Sculpt Class has none (most common case), OR
  //   b) Both have product IDs but they're swapped (we can check by product name in Stripe — but
  //      since we can't call Stripe here, we rely on the known corruption pattern)

  const sculptProductId = sculptEvent.stripeProductId;
  const matProductId = matPilatesEvent.stripeProductId;

  let repairNeeded = false;
  let correctProductIdForSculpt: string | null = null;
  let shouldClearMatProductId = false;

  if (!sculptProductId && matProductId) {
    // Classic corruption: Mat Pilates is holding a product ID, Sculpt Class has none
    // The product ID on Mat Pilates is likely the Sculpt Class one
    console.log("\n⚠️  CORRUPTION DETECTED:");
    console.log("   Mat Pilates holds a stripeProductId but Sculpt Class has none.");
    console.log("   This matches the known corruption pattern.");
    correctProductIdForSculpt = matProductId;
    shouldClearMatProductId = true;
    repairNeeded = true;
  } else if (sculptProductId && matProductId) {
    console.log("\nℹ️  Both events have stripeProductId set. Manual review recommended.");
    console.log("   Sculpt Class:", sculptProductId);
    console.log("   Mat Pilates:", matProductId);
    console.log("   Proceeding with ticket correction only (no product ID swap).");
    repairNeeded = false; // No product ID fix, but we still fix tickets below
  } else if (!sculptProductId && !matProductId) {
    console.log("\nℹ️  Neither event has a stripeProductId. No product link to repair.");
    console.log("   Proceeding with ticket correction only.");
    repairNeeded = false;
  } else {
    console.log("\n✅ Sculpt Class already has its stripeProductId. No product link repair needed.");
    repairNeeded = false;
  }

  // 3. Apply product ID fix
  if (repairNeeded && correctProductIdForSculpt) {
    console.log("\n🔧 Applying product ID repair...");

    if (shouldClearMatProductId) {
      await db.update(events)
        .set({ stripeProductId: null })
        .where(eq(events.id, matPilatesEvent.id));
      console.log(`  ✅ Cleared stripeProductId from Mat Pilates event [${matPilatesEvent.id}]`);
    }

    await db.update(events)
      .set({ stripeProductId: correctProductIdForSculpt })
      .where(eq(events.id, sculptEvent.id));
    console.log(`  ✅ Set stripeProductId on Sculpt Class event [${sculptEvent.id}]: ${correctProductIdForSculpt}`);
  }

  // 4. Find and fix tickets for the affected customers that are linked to the wrong event
  console.log("\n🎫 Checking tickets for affected customers...");

  const allTickets = await db.select().from(tickets);

  // Find tickets for affected customers linked to Mat Pilates event
  // (these should have been for Sculpt Class)
  const affectedTickets = allTickets.filter(t => {
    if (t.eventId !== matPilatesEvent.id) return false;
    // Check if purchaser name or email matches an affected customer
    const nameLower = (t.purchaserName || "").toLowerCase();
    const emailLower = (t.purchaserEmail || "").toLowerCase();
    return AFFECTED_EMAILS.some(ae => nameLower.includes(ae) || emailLower.includes(ae.replace(" ", "")));
  });

  // Also check by ticket type — tickets with ticketType containing sculpt/mallory under mat pilates event
  const sculptTicketsUnderMatPilates = allTickets.filter(t => {
    if (t.eventId !== matPilatesEvent.id) return false;
    const combined = `${t.ticketType || ""} ${t.ticketTime || ""}`.toLowerCase();
    return SCULPT_CLASS_KEYWORDS.some(kw => combined.includes(kw));
  });

  // Merge both sets (deduplicate by id)
  const wrongTicketIds = new Set<string>();
  [...affectedTickets, ...sculptTicketsUnderMatPilates].forEach(t => wrongTicketIds.add(t.id));
  const wrongTickets = allTickets.filter(t => wrongTicketIds.has(t.id));

  console.log(`\n📋 Tickets linked to Mat Pilates that appear to belong to Sculpt Class: ${wrongTickets.length}`);
  for (const t of wrongTickets) {
    console.log(`  - [${t.id}] ${t.purchaserName} <${t.purchaserEmail}>`);
    console.log(`    ticketType=${t.ticketType} | ticketTime=${t.ticketTime} | status=${t.status}`);
  }

  if (wrongTickets.length === 0) {
    console.log("  (none found — tickets may have already been corrected or weren't created under this event)");
  }

  // 5. Fix the wrong tickets: reassign to Sculpt Class event and mark pending_review
  let correctedCount = 0;
  for (const t of wrongTickets) {
    await db.update(tickets)
      .set({ eventId: sculptEvent.id, status: "pending_review" })
      .where(eq(tickets.id, t.id));
    console.log(`  ✅ Ticket [${t.id}] reassigned to Sculpt Class event and marked pending_review`);
    console.log(`     Customer: ${t.purchaserName} <${t.purchaserEmail}>`);
    correctedCount++;
  }

  // 6. Print summary for admin action
  console.log("\n" + "=".repeat(60));
  console.log("📊 REPAIR SUMMARY");
  console.log("=".repeat(60));
  if (repairNeeded) {
    console.log(`  ✅ Cleared stripeProductId from Mat Pilates event`);
    console.log(`  ✅ Linked stripeProductId to Sculpt Class event: ${correctProductIdForSculpt}`);
  } else {
    console.log("  ℹ️  No product ID repair was needed (already correct or manual review required)");
  }
  console.log(`  ✅ ${correctedCount} ticket(s) reassigned to Sculpt Class event`);
  if (correctedCount > 0) {
    console.log(`\n⚠️  ACTION REQUIRED: ${correctedCount} ticket(s) are now in 'pending_review' status.`);
    console.log("   Please review them in the admin panel and resend corrected tickets to:");
    for (const t of wrongTickets) {
      console.log(`   - ${t.purchaserName} <${t.purchaserEmail}> | Ticket ID: ${t.id}`);
    }
  }
  console.log("\n✅ Repair complete.");
}

main().catch(err => {
  console.error("❌ Repair script failed:", err);
  process.exit(1);
});
