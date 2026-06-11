import Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { generateTicketQR } from "./qrcode";
import { sendTicketEmail } from "./emailService";
import { parseFuzzyEventDate } from "./dateUtils";
import type { Event } from "@shared/schema";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET not configured");
    }

    const stripe = await getUncachableStripeClient();
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    console.log("✅ Webhook validated | Event:", event.type);

    if (event.type === "checkout.session.completed") {
      await this.handleCheckoutCompleted(event);
    } else {
      console.log("ℹ️ Event received (not checkout):", event.type);
    }
  }

  /**
   * Resolve which DB event a Stripe product belongs to.
   * Fallback chain (in priority order):
   *   1. Stripe product ID match (most reliable — product already linked)
   *   2. Exact (eventType, eventDate) string match (standard naming convention)
   *   3. Calendar-date proximity ±3 days (handles location-prefixed dates like "Carlsbad | Jun 27th")
   *   4. Date extracted from full product name (handles non-standard names)
   * Returns null if no existing event matches → caller should create a new one.
   */
  static async resolveEvent(
    productId: string,
    productName: string,
    eventType: string,
    eventDate: string,
  ): Promise<{ event: Event; matchedBy: string } | null> {
    // 1. Stripe product ID
    const byProductId = await storage.getEventByStripeProductId(productId);
    if (byProductId) {
      return { event: byProductId, matchedBy: "stripe_product_id" };
    }

    // 2. Exact (eventType, eventDate)
    const byTypeDate = await storage.getEventByTypeAndDate(eventType, eventDate);
    if (byTypeDate) {
      return { event: byTypeDate, matchedBy: "type+date_exact" };
    }

    // 3 & 4. Calendar proximity — try parsed eventDate first, then keywords in the full product name
    const candidateDates: Array<{ date: Date; source: string }> = [];

    if (eventDate !== "TBD" && eventDate !== "") {
      const parsed = parseFuzzyEventDate(eventDate);
      if (parsed) candidateDates.push({ date: parsed, source: "parsed_event_date" });
    }

    // Always try to extract a date from the full product name as well
    const fromName = parseFuzzyEventDate(productName);
    if (fromName) {
      const alreadyHave = candidateDates.some(
        c => Math.abs(c.date.getTime() - fromName.getTime()) < 24 * 60 * 60 * 1000,
      );
      if (!alreadyHave) candidateDates.push({ date: fromName, source: "product_name" });
    }

    for (const { date, source } of candidateDates) {
      const nearby = await storage.findEventByCalendarProximity(date, 3);
      if (nearby.length === 0) continue;

      // Prefer an event whose eventType matches; otherwise take the closest by calendar date
      const typeMatch = nearby.find(
        e => (e.eventType || "").toLowerCase() === eventType.toLowerCase(),
      );
      const best = typeMatch || nearby.sort((a, b) => {
        const da = Math.abs(new Date(a.calendarDate!).getTime() - date.getTime());
        const db2 = Math.abs(new Date(b.calendarDate!).getTime() - date.getTime());
        return da - db2;
      })[0];

      return { event: best, matchedBy: `calendar_proximity(${source})` };
    }

    return null;
  }

  static async handleCheckoutCompleted(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log("\n" + "=".repeat(60));
    console.log("💳 CHECKOUT SESSION COMPLETED - Marco M1");
    console.log("=".repeat(60));

    const customerName = session.customer_details?.name || "Guest";
    const customerEmail = session.customer_details?.email || "unknown@example.com";
    const customerPhone = session.customer_details?.phone || null;
    const customerAddress = session.customer_details?.address || null;
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

    console.log("📧 Customer:", customerName, "|", customerEmail);

    try {
      const stripe = await getUncachableStripeClient();
      const expandedSession = await stripe.checkout.sessions.retrieve(
        session.id,
        { expand: ["line_items", "line_items.data.price.product"] },
      );

      if (!expandedSession.line_items?.data) {
        console.error("❌ No line items found in session");
        return;
      }

      const existingTickets = await storage.getTicketsByStripeSession(session.id);
      if (existingTickets.length > 0) {
        console.log(`⚠️ Tickets already exist for session ${session.id} (idempotency check). Skipping.`);
        return;
      }

      const sessionEventsAttended: string[] = [];
      const sessionTicketTypes: string[] = [];

      for (const item of expandedSession.line_items.data) {
        const product = item.price?.product as Stripe.Product | undefined;
        if (!product || typeof product !== "object") continue;

        console.log("\n🎫 Product:", product.name);

        // Parse date/time/type from product name using standard naming convention
        let eventDate = "TBD";
        let eventTime = "TBD";
        let eventType = "General";

        const pattern1 = /^(.+?),\s*(.+?)\s*-\s*(.+?)\s*Event Ticket$/;
        const pattern2 = /^(.+?),\s*(\d{1,2}\s*(?:AM|PM)\s*-\s*\d{1,2}\s*(?:AM|PM)),\s*(.+)$/i;
        const pattern3 = /^(.+?),\s*(.+?),\s*(.+)$/;

        const match = product.name.match(pattern1) || product.name.match(pattern2) || product.name.match(pattern3);

        if (match) {
          eventDate = match[1].trim();
          eventTime = match[2].trim();
          eventType = match[3].trim();
          console.log("  ✅ Parsed: Date:", eventDate, "| Time:", eventTime, "| Type:", eventType);
        } else {
          console.log("  ⚠️ Name doesn't match expected pattern, using defaults");
        }

        // Resolve existing DB event via the priority fallback chain
        const resolved = await WebhookHandlers.resolveEvent(product.id, product.name, eventType, eventDate);

        let dbEvent: Event;

        if (resolved) {
          dbEvent = resolved.event;
          console.log(`  📦 Event matched (${resolved.matchedBy}): ${dbEvent.id} → ${dbEvent.name}`);

          // Link Stripe product ID if not set
          if (!dbEvent.stripeProductId && product.id) {
            await storage.updateEvent(dbEvent.id, { stripeProductId: product.id });
            console.log("  🔗 Linked stripeProductId to event:", dbEvent.id);
          }

          // Backfill calendarDate if missing and we can derive it from an admin mapping
          if (!dbEvent.calendarDate && eventDate !== "TBD") {
            const dateNames = await storage.listEventDateNames();
            const mapping = dateNames.find(dn => dn.eventDate === eventDate);
            if (mapping) {
              const hint = mapping.createdAt ? new Date(mapping.createdAt) : undefined;
              const derived = parseFuzzyEventDate(mapping.eventDate, hint);
              if (derived) {
                await storage.updateEvent(dbEvent.id, { calendarDate: derived });
                dbEvent = { ...dbEvent, calendarDate: derived };
                console.log("  📅 Backfilled calendarDate:", derived.toDateString());
              }
            }
          }
        } else {
          // No existing event found — derive calendarDate and create a new one
          let derivedCalendarDate: Date | null = null;
          if (eventDate !== "TBD") {
            const dateNames = await storage.listEventDateNames();
            const mapping = dateNames.find(dn => dn.eventDate === eventDate);
            if (mapping) {
              const hint = mapping.createdAt ? new Date(mapping.createdAt) : undefined;
              derivedCalendarDate = parseFuzzyEventDate(mapping.eventDate, hint);
            }
            if (!derivedCalendarDate) {
              derivedCalendarDate = parseFuzzyEventDate(eventDate);
            }
          }

          dbEvent = await storage.createEvent({
            name: product.name,
            date: eventDate,
            time: eventTime !== "TBD" ? eventTime : null,
            eventType,
            location: "San Diego, CA",
            priceInCents: null,
            stripeProductId: product.id,
            active: true,
            capacity: null,
            calendarDate: derivedCalendarDate,
          });
          console.log("  📦 Event created:", dbEvent.id, "→", product.name, derivedCalendarDate ? `| 📅 ${derivedCalendarDate.toDateString()}` : "");
        }

        // Register event date name if not already present
        if (eventDate !== "TBD") {
          try {
            const existingNames = await storage.listEventDateNames();
            const existing = existingNames.find(edn => edn.eventDate === eventDate);
            if (!existing) {
              await storage.upsertEventDateName({ eventDate, eventName: eventDate });
              console.log("  📅 Event date name registered:", eventDate);
            }
          } catch (err) {
            console.error("  ⚠️ Failed to register event date name:", err);
          }
        }

        sessionEventsAttended.push(eventDate);
        sessionTicketTypes.push(eventType);

        const quantity = item.quantity || 1;
        for (let i = 0; i < quantity; i++) {
          const ticketId = crypto.randomUUID();
          const { qrData, qrCode, ticketUrl } = await generateTicketQR(ticketId);

          const ticket = await storage.createTicket({
            eventId: dbEvent.id,
            purchaserName: customerName,
            purchaserEmail: customerEmail,
            ticketType: eventType,
            ticketTime: eventTime !== "TBD" ? eventTime : null,
            stripeSessionId: session.id,
            stripePaymentIntentId: paymentIntent || null,
            qrCode,
            qrData,
            ticketUrl,
            status: "valid",
          });

          console.log(`  🎟️ Ticket ${i + 1}/${quantity} created: ${ticket.id}`);
          console.log(`     URL: /ticket/${ticketUrl}`);
          console.log(`     QR Data: ${qrData}`);

          sendTicketEmail({ ticket, event: dbEvent }).catch(err =>
            console.error("  ⚠️ Email send failed (non-blocking):", err)
          );
        }
      }

      try {
        await storage.createOrUpdateCustomer({
          name: customerName,
          email: customerEmail,
          phone: customerPhone,
          streetAddress: customerAddress?.line1 || null,
          city: customerAddress?.city || null,
          state: customerAddress?.state || null,
          postal: customerAddress?.postal_code || null,
          eventsAttended: [...new Set(sessionEventsAttended)],
          ticketTypes: [...new Set(sessionTicketTypes)],
        }, true);
        console.log(`  👤 Customer saved: ${customerEmail}`);
      } catch (err) {
        console.error("  ⚠️ Failed to save customer (non-blocking):", err);
      }

      console.log("\n" + "=".repeat(60));
      console.log("✅ All tickets created successfully!");
      console.log("=".repeat(60) + "\n");
    } catch (apiError) {
      console.error("❌ Error processing checkout:", apiError);
      throw apiError;
    }
  }
}
