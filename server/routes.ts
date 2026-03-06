import type { Express } from "express";
  import type { Server } from "http";
  import express from "express";
  import Stripe from "stripe";

  export async function registerRoutes(httpServer: Server, app: Express) {
    // ============================================
    // 🚀 MATCHA ON ICE - MODO DE PRODUÇÃO
    // ============================================
    
    console.log("🍵❄️ Matcha On Ice - Sistema de Gestão de Ingressos");
    console.log("🚀 Modo: PRODUÇÃO");
    console.log("✅ Integração Stripe configurada via Replit");
    
    // Webhook do Stripe para processar compras de ingressos
    app.post(
      "/webhook/stripe",
      express.raw({ type: "application/json" }),
      async (req, res) => {
        console.log("\n" + "=".repeat(60));
        console.log("🔔 WEBHOOK DO STRIPE RECEBIDO");
        console.log("=".repeat(60));
        
        const sig = req.headers["stripe-signature"];
        
        if (!sig) {
          console.error("❌ Stripe signature missing");
          return res.status(400).send("Stripe signature missing");
        }

        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        
        if (!webhookSecret) {
          console.error("❌ STRIPE_WEBHOOK_SECRET não configurado!");
          console.error("⚠️ Configure o webhook secret nas Secrets do Replit");
          return res.status(500).send("Webhook secret not configured");
        }
        
        let event: Stripe.Event;
        
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
          event = stripe.webhooks.constructEvent(
            req.body,
            sig as string,
            webhookSecret
          );
          console.log("✅ Assinatura do webhook validada");
        } catch (err) {
          console.error("❌ Erro ao validar webhook:", err);
          return res.status(400).send(`Webhook Error: ${err}`);
        }

        console.log("📋 Evento:", event.type);
        console.log("🆔 ID:", event.id);

        // Processar compra concluída
        if (event.type === "checkout.session.completed") {
          const session = event.data.object as Stripe.Checkout.Session;
          
          console.log("\n💳 COMPRA CONCLUÍDA - Processando ingresso(s)");
          console.log("=".repeat(60));
          
          console.log("📧 Cliente:", session.customer_details?.email);
          console.log("👤 Nome:", session.customer_details?.name);
          console.log("💰 Valor:", (session.amount_total || 0) / 100, session.currency?.toUpperCase());
          console.log("✅ Status:", session.payment_status);
          
          try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
            
            // Expandir line_items para obter detalhes dos produtos
            const expandedSession = await stripe.checkout.sessions.retrieve(
              session.id,
              {
                expand: ["line_items", "line_items.data.price.product"],
              }
            );

            console.log("\n🎫 INGRESSOS COMPRADOS:");
            
            if (expandedSession.line_items?.data) {
              for (const item of expandedSession.line_items.data) {
                const product = item.price?.product as Stripe.Product | undefined;
                
                if (product && typeof product === "object") {
                  console.log("\n  " + "-".repeat(50));
                  console.log("  📝 Produto:", product.name);
                  console.log("  💰 Quantidade:", item.quantity);
                  console.log("  💵 Valor unitário:", (item.price?.unit_amount || 0) / 100, item.currency?.toUpperCase());
                  
                  // Extrair informações do ingresso
                  if (product.name.includes("Event Ticket")) {
                    // Padrão: [Data], [Hora] - [Tipo] Event Ticket
                    const namePattern = /^(.+?),\s*(.+?)\s*-\s*(.+?)\s*Event Ticket$/;
                    const match = product.name.match(namePattern);
                    
                    if (match) {
                      const eventDate = match[1];
                      const eventTime = match[2];
                      const ticketType = match[3];
                      
                      console.log("  📅 Data do Evento:", eventDate);
                      console.log("  ⏰ Horário:", eventTime);
                      console.log("  🏷️ Tipo:", ticketType);
                      
                      // TODO: Marco M1 - Salvar no banco de dados
                      console.log("\n  ⚠️ Marco T0: Dados extraídos, mas não salvos (aguardando Marco M1)");
                      
                      // Aqui no Marco M1 você vai:
                      // 1. Salvar evento (se não existir)
                      // 2. Criar sessão do evento
                      // 3. Gerar ingressos com QR codes
                      // 4. Salvar cliente
                      // 5. Enviar email (Marco M5)
                    } else {
                      console.log("  ⚠️ Nome do produto não segue o padrão esperado");
                      console.log("  📌 Padrão correto: [Data], [Hora] - [Tipo] Event Ticket");
                    }
                  }
                }
              }
            }
            
            console.log("\n" + "=".repeat(60));
            console.log("✅ Webhook processado com sucesso");
            console.log("=".repeat(60) + "\n");
            
          } catch (apiError) {
            console.error("❌ Erro ao expandir line items:");
            console.error(apiError);
          }
        } else {
          console.log("ℹ️ Evento ignorado:", event.type);
        }

        // Sempre retornar 200 para o Stripe
        res.json({ received: true });
      }
    );

    // Health check
    app.get("/api/health", (_req, res) => {
      res.json({ 
        status: "ok", 
        message: "Matcha On Ice - Sistema de Gestão de Ingressos",
        mode: "PRODUCTION",
        phase: "Marco T0 - Validação Técnica",
        stripe_configured: !!process.env.STRIPE_SECRET_KEY,
        webhook_configured: !!process.env.STRIPE_WEBHOOK_SECRET
      });
    });
  }