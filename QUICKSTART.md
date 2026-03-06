# 🚀 Quick Start - Marco T0

  ## Configuração Rápida (5 minutos)

  ### 1. Adicionar Secrets no Replit
  ```
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```

  ### 2. Configurar Webhook
  - URL: https://[seu-repl].replit.dev/webhook/stripe/test
  - Evento: checkout.session.completed

  ### 3. Criar Produto
  Formato: [Data], [Hora] - [Tipo] Event Ticket
  Exemplo: Feb 26th, 6 PM - Members Event Ticket

  ### 4. Testar
  - Cartão: 4242 4242 4242 4242
  - Verificar logs no console

  ### 5. Validar
  Procure por estes logs:
  - ✅ Webhook recebido
  - ✅ LINE ITEMS EXPANDIDOS
  - ✅ DADOS EXTRAÍDOS

  ## Pronto! 🎉
  Se todos os logs aparecerem, podemos avançar para o Marco M1.
  