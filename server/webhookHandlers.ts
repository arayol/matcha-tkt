import { getStripeSync, getUncachableStripeClient } from "./stripeClient";
import type Stripe from "stripe";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string) {
    const stripeSync = await getStripeSync();
    await stripeSync.processWebhook(payload, signature);

    console.log("✅ Webhook processado pelo stripe-replit-sync");

    const event = JSON.parse(payload.toString()) as Stripe.Event;
    console.log("📋 Evento:", event.type);

    if (event.type === "checkout.session.completed") {
      await this.handleCheckoutCompleted(event);
    }
  }

  static async handleCheckoutCompleted(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;

    console.log("\n" + "=".repeat(60));
    console.log("💳 CHECKOUT SESSION COMPLETED - Marco T0");
    console.log("=".repeat(60));

    console.log("\n📦 DADOS DA SESSÃO:");
    console.log("  • Session ID:", session.id);
    console.log("  • Payment Status:", session.payment_status);
    console.log(
      "  • Amount Total:",
      (session.amount_total || 0) / 100,
      session.currency?.toUpperCase(),
    );
    console.log(
      "  • Customer Email:",
      session.customer_details?.email || "não disponível",
    );
    console.log(
      "  • Customer Name:",
      session.customer_details?.name || "não disponível",
    );

    try {
      const stripe = await getUncachableStripeClient();

      const expandedSession = await stripe.checkout.sessions.retrieve(
        session.id,
        {
          expand: ["line_items", "line_items.data.price.product"],
        },
      );

      console.log("\n✅ LINE ITEMS EXPANDIDOS COM SUCESSO!");
      console.log("\n🎫 INGRESSOS COMPRADOS:");

      if (expandedSession.line_items?.data) {
        for (const item of expandedSession.line_items.data) {
          const product = item.price?.product as Stripe.Product | undefined;

          if (product && typeof product === "object") {
            console.log("\n  " + "-".repeat(50));
            console.log("  📝 Produto:", product.name);
            console.log("  💰 Quantidade:", item.quantity);
            console.log(
              "  💵 Valor:",
              (item.amount_total || 0) / 100,
              item.currency?.toUpperCase(),
            );
            console.log("  🏷️ ID:", product.id);
            console.log(
              "  📄 Metadata:",
              JSON.stringify(product.metadata, null, 2),
            );

            if (product.name.includes("Event Ticket")) {
              console.log("\n  ✅ INGRESSO DE EVENTO IDENTIFICADO!");

              const namePattern =
                /^(.+?),\s*(.+?)\s*-\s*(.+?)\s*Event Ticket$/;
              const match = product.name.match(namePattern);

              if (match) {
                console.log("  ✅ DADOS EXTRAÍDOS:");
                console.log("    • Data:", match[1]);
                console.log("    • Hora:", match[2]);
                console.log("    • Tipo:", match[3]);
              } else {
                console.log("  ⚠️ Nome não segue o padrão esperado");
                console.log(
                  "  📌 Padrão: [Data], [Hora] - [Tipo] Event Ticket",
                );
              }
            }
          }
        }
      }

      console.log("\n" + "=".repeat(60));
      console.log("📊 RESUMO DA VALIDAÇÃO T0");
      console.log("=".repeat(60));
      console.log("✅ Webhook recebido e processado");
      console.log(
        "✅ Dados do cliente:",
        session.customer_details?.email ? "SIM" : "NÃO",
      );
      console.log(
        "✅ Line items expandidos:",
        expandedSession.line_items?.data ? "SIM" : "NÃO",
      );
      console.log("=".repeat(60) + "\n");
    } catch (apiError) {
      console.error("❌ Erro ao expandir line items:", apiError);
    }
  }
}
