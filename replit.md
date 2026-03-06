# Matcha On Ice - Sistema de Gestão de Ingressos

## Sobre
Sistema de gestão de ingressos para eventos fitness em San Diego, CA. Inclui integração com Stripe para vendas automatizadas, QR codes, URLs únicas de ingressos, dashboard admin e PWA mobile para validação.

## Status: Marco T0 - Validação Técnica ✅
- Webhook Stripe recebendo e validando eventos com sucesso
- Assinatura de webhook verificada (constructEvent)
- Pipeline: Stripe → Webhook → Express → Handler funcionando

## Arquitetura
- **Frontend:** React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Express.js + TypeScript
- **Banco:** PostgreSQL (Replit) + Drizzle ORM
- **Stripe:** stripe-replit-sync para migrações/sync + verificação direta de assinatura para webhooks

## Arquivos Importantes
- `server/index.ts` — Servidor principal, rota webhook POST `/api/stripe/webhook` (registrada ANTES de express.json())
- `server/stripeClient.ts` — Cliente Stripe usando `STRIPE_SECRET_KEY` env var
- `server/webhookHandlers.ts` — Processamento de webhooks, handler para checkout.session.completed
- `server/routes.ts` — API routes (health check, webhook GET test)
- `shared/schema.ts` — Schema do banco (a expandir no Marco M1)
- `client/src/App.tsx` — Frontend (página de instruções T0)
- `client/src/index.css` — Tema verde/teal

## Secrets Necessárias
- `STRIPE_SECRET_KEY` — Chave secreta do Stripe (sk_test_... ou sk_live_...)
- `STRIPE_WEBHOOK_SECRET` — Signing secret do webhook (whsec_...)
- `DATABASE_URL` — Conexão PostgreSQL (automática Replit)
- `SESSION_SECRET` — Secret para sessões

## Convenção de Produtos Stripe
Formato do nome: `[Data], [Hora] - [Tipo] Event Ticket`
Exemplo: `Feb 26th, 6 PM - Members Event Ticket`
Tipos: Members, General, VIP

## Tema CSS
- Primary: verde/teal (hsl 152 60% 36%)
- Tema escuro suportado
