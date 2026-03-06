# 🍵❄️ Matcha On Ice - Sistema de Gestão de Ingressos

  > 🚀 **Modo: PRODUÇÃO** | Marco T0 - Validação Técnica

  Sistema completo de gestão de ingressos para eventos de fitness com integração Stripe, QR codes, dashboard administrativo e app mobile de validação.

  ## ✅ Status da Integração Stripe

  - ✅ Integração oficial do Stripe configurada via Replit
  - ✅ Credenciais gerenciadas automaticamente de forma segura
  - ⚠️ Aguardando configuração do STRIPE_WEBHOOK_SECRET

  ## 🚀 Quick Start - Produção

  ### 1. Configure o Webhook Secret
  ```bash
  # Adicione nas Secrets do Replit:
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```

  ### 2. Configure o Webhook no Stripe
  - URL: `https://[seu-repl].replit.dev/webhook/stripe`
  - Evento: `checkout.session.completed`

  ### 3. Configure os Produtos
  Formato: `[Data], [Hora] - [Tipo] Event Ticket`

  **Exemplo:** `Feb 26th, 6 PM - Members Event Ticket`

  📖 **[Guia Completo de Produção →](PRODUCTION.md)**

  ## 📋 Marcos do Projeto

  ### ✅ Marco T0 - Validação Técnica (ATUAL)
  - [x] Integração Stripe configurada
  - [x] Endpoint de webhook criado (`/webhook/stripe`)
  - [x] Validação de assinatura implementada
  - [x] Expansão de line_items via API
  - [x] Extração de dados do produto (data, hora, tipo)
  - [ ] **AGUARDANDO:** Teste em produção com webhook configurado

  ### 📅 Próximos Marcos

  **Marco M1 - Backend Core** (1-2 semanas)
  - Banco de dados PostgreSQL
  - Schema completo (eventos, sessões, ingressos, clientes)
  - API REST com autenticação
  - CRUD de eventos e sessões

  **Marco M2 - Integração Stripe Completa** (1-2 semanas)
  - Salvamento automático de ingressos
  - Processamento de múltiplos itens
  - Tratamento de erros e retry

  **Marco M3 - Sistema de Ingressos** (1-2 semanas)
  - Geração de QR codes únicos
  - URLs de visualização web
  - Página de ingresso mobile-friendly
  - Download de PDF

  **Marco M4 - Dashboard Admin** (1-2 semanas)
  - Interface de gerenciamento
  - Geração de cortesias
  - Relatórios de vendas

  **Marco M5 - Sistema de Emails** (1-1.5 semanas)
  - Emails de confirmação
  - Lembretes automáticos
  - Configuração por evento

  **Marco M6 - App Mobile** (1-2 semanas)
  - Scanner de QR code (PWA)
  - Validação de ingressos
  - Feedback visual

  **Marco M7 - Testes e Go-Live** (1 semana)
  - Testes de integração
  - Testes de carga
  - Deploy final

  ## 🛠️ Stack Técnica

  **Frontend:**
  - React + TypeScript
  - Tailwind CSS + Shadcn UI
  - Wouter (routing)
  - TanStack Query

  **Backend:**
  - Node.js + Express
  - PostgreSQL + Drizzle ORM
  - Stripe SDK (via Replit Integration)
  - JWT para autenticação

  ## 📁 Estrutura do Projeto

  ```
  matcha-on-ice/
  ├── client/                 # Frontend React
  │   └── src/
  │       ├── components/    # Componentes UI
  │       └── App.tsx        # Instruções de produção
  ├── server/                # Backend Express
  │   ├── routes.ts          # Webhook handler (produção)
  │   ├── db.ts              # Configuração PostgreSQL
  │   └── index.ts           # Servidor principal
  └── docs/
      ├── README.md          # Este arquivo
      ├── PRODUCTION.md      # Guia de produção
      └── QUICKSTART.md      # Setup rápido
  ```

  ## 📍 Endpoints Disponíveis

  ### Marco T0 (Atual)
  - `POST /webhook/stripe` - Webhook de produção do Stripe
  - `GET /api/health` - Health check do sistema

  ## 🔒 Variáveis de Ambiente

  ```env
  # Configuradas via Replit Integration
  STRIPE_SECRET_KEY=sk_live_... (gerenciado automaticamente)

  # Você precisa adicionar:
  STRIPE_WEBHOOK_SECRET=whsec_...

  # Futuro (Marco M1+)
  DATABASE_URL=postgresql://... (fornecido pelo Replit)
  JWT_SECRET=...
  SESSION_SECRET=... (já configurado)
  ```

  ## 📚 Documentação

  - 📖 [Guia de Produção](PRODUCTION.md) - Configuração completa
  - 🚀 [Quick Start](QUICKSTART.md) - Setup em 5 minutos
  - 🔗 [Stripe Webhooks](https://stripe.com/docs/webhooks)
  - 🔗 [Checkout Session API](https://stripe.com/docs/api/checkout/sessions)

  ## ⏱️ Cronograma Estimado

  - **T0** - Validação Técnica: Configuração ⬅️ **VOCÊ ESTÁ AQUI**
  - **M1** - Backend Core: 1-2 semanas
  - **M2** - Integração Stripe: 1-2 semanas
  - **M3** - Sistema de Ingressos: 1-2 semanas
  - **M4** - Dashboard Admin: 1-2 semanas
  - **M5** - Sistema de Emails: 1-1.5 semanas
  - **M6** - App Mobile: 1-2 semanas
  - **M7** - Testes e Go-Live: 1 semana

  **Total estimado:** 8.5-12.5 semanas

  ## 🆘 Suporte

  Em caso de dúvidas ou problemas:
  1. Verifique o [Guia de Produção](PRODUCTION.md)
  2. Consulte os logs no console do Replit
  3. Verifique a configuração do webhook no Stripe Dashboard

  ---

  💚 **Desenvolvido para Matcha On Ice** - San Diego, CA
  🚀 **Status:** Produção - Marco T0
  