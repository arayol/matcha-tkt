import Stripe from "stripe";
import { getUncachableStripeClient } from "./stripeClient";
import { storage } from "./storage";
import { generateTicketQR } from "./qrcode";
import { sendTicketEmail } from "./emailService";

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

  static async handleCheckoutCompleted(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log("\n" + "=".repeat(60));
    console.log("💳 CHECKOUT SESSION COMPLETED - Marco M1");
    console.log("=".repeat(60));

    const customerName = session.customer_details?.name || "Guest";
    const customerEmail = session.customer_details?.email || "unknown@example.com";
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

      for (const item of expandedSession.line_items.data) {
        const product = item.price?.product as Stripe.Product | undefined;
        if (!product || typeof product !== "object") continue;

        console.log("\n🎫 Product:", product.name);

        const namePattern = /^(.+?),\s*(.+?)\s*-\s*(.+?)\s*Event Ticket$/;
        const match = product.name.match(namePattern);

        let eventDate = "TBD";
        let eventTime = "TBD";
        let eventType = "General";

        if (match) {
          eventDate = match[1].trim();
          eventTime = match[2].trim();
          eventType = match[3].trim();
          console.log("  ✅ Parsed: Date:", eventDate, "| Time:", eventTime, "| Type:", eventType);
        } else {
          console.log("  ⚠️ Name doesn't match expected pattern, using defaults");
        }

        let dbEvent = await storage.getEventByStripeProductId(product.id);
        if (!dbEvent) {
          dbEvent = await storage.createEvent({
            name: product.name,
            date: eventDate,
            time: eventTime,
            eventType,
            location: "San Diego, CA",
            priceInCents: item.price?.unit_amount || 0,
            stripeProductId: product.id,
            active: true,
            capacity: null,
          });
          console.log("  📦 Event created in DB:", dbEvent.id);
        } else {
          console.log("  📦 Event found in DB:", dbEvent.id);
        }

        const quantity = item.quantity || 1;
        for (let i = 0; i < quantity; i++) {
          const ticketId = crypto.randomUUID();
          const { qrData, qrCode, ticketUrl } = await generateTicketQR(ticketId);

          const ticket = await storage.createTicket({
            eventId: dbEvent.id,
            purchaserName: customerName,
            purchaserEmail: customerEmail,
            ticketType: eventType,
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

      console.log("\n" + "=".repeat(60));
      console.log("✅ All tickets created successfully!");
      console.log("=".repeat(60) + "\n");
    } catch (apiError) {
      console.error("❌ Error processing checkout:", apiError);
      throw apiError;
    }
  }
}
