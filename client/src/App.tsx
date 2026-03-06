import { useState } from "react";
import { CheckCircle2, Circle, ExternalLink, Copy, Check, LayoutDashboard, Ticket, Settings, LogOut, Search } from "lucide-react";

export default function App() {
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [activeNav, setActiveNav] = useState(0);

  const webhookUrl = `${window.location.origin}/api/stripe/webhook`;

  const copyToClipboard = (text: string, setter: (value: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: Ticket, label: "Ingressos" },
    { icon: Settings, label: "Config" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="app-root">
      <div className="mx-auto grid max-w-[1440px] grid-cols-[88px_1fr] gap-6 p-6 lg:grid-cols-[88px_1fr_320px]">

        <aside className="flex min-h-[calc(100vh-48px)] flex-col items-center justify-between rounded-[32px] border border-sidebar-border bg-sidebar px-4 py-6 shadow-card" data-testid="sidebar">
          <div className="flex flex-col items-center gap-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft text-xl font-bold" data-testid="logo">
              M
            </div>

            <nav className="mt-4 flex flex-col gap-4">
              {navItems.map((item, index) => (
                <button
                  key={item.label}
                  onClick={() => setActiveNav(index)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    activeNav === index
                      ? "bg-sidebar-accent text-primary"
                      : "text-muted-foreground hover:bg-sidebar-accent"
                  }`}
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="h-5 w-5" />
                </button>
              ))}
            </nav>
          </div>

          <button
            className="flex h-11 w-11 items-center justify-center rounded-xl text-primary hover:bg-sidebar-accent transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </aside>

        <main className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-title">My Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">Matcha On Ice - Sistema de Ingressos</p>
            </div>

            <div className="flex h-12 w-[260px] items-center gap-3 rounded-2xl bg-card px-4 shadow-soft border border-card-border">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Search anything..."
                data-testid="input-search"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-status">
            <div className="mb-6 grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-muted-foreground">Status do Sistema</p>
                <p className="mt-2 text-3xl font-semibold">Marco T0</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Integração Stripe</p>
                <p className="mt-2 text-2xl font-semibold text-primary">Ativa</p>
              </div>
              <div>
                <p className="text-sm font-medium">Webhook</p>
                <p className="mt-1 text-sm text-muted-foreground">Recebendo eventos com sucesso</p>
              </div>
            </div>
            <div className="h-px bg-border" />
            <div className="mt-4 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-status-online" />
              <span className="text-sm text-muted-foreground">Validação Técnica Completa</span>
            </div>
          </div>

          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-webhook">
            <h2 className="text-[28px] font-semibold tracking-tight">Configurar Webhook</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-6">Configure o endpoint para receber vendas em tempo real</p>

            <div className="space-y-5">
              <div className="flex items-start gap-4 p-5 rounded-2xl bg-muted/50 border border-muted-border">
                <div className="flex-shrink-0 w-9 h-9 bg-primary text-primary-foreground rounded-xl flex items-center justify-center font-semibold text-sm">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base mb-2">Endpoint URL</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="flex-1 px-4 py-2.5 bg-card border border-card-border rounded-xl text-sm font-mono"
                      data-testid="input-webhook-url"
                    />
                    <button
                      onClick={() => copyToClipboard(webhookUrl, setCopiedWebhook)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-card-border bg-card hover:bg-sidebar-accent transition-colors"
                      data-testid="button-copy-webhook"
                    >
                      {copiedWebhook ? <Check className="h-4 w-4 text-status-online" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-4 p-5 rounded-2xl bg-muted/50 border border-muted-border">
                <div className="flex-shrink-0 w-9 h-9 bg-primary text-primary-foreground rounded-xl flex items-center justify-center font-semibold text-sm">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base mb-2">Evento Requerido</h3>
                  <code className="inline-block bg-card px-4 py-2.5 rounded-xl border border-card-border text-sm font-mono">
                    checkout.session.completed
                  </code>
                </div>
              </div>

              <div className="flex items-start gap-4 p-5 rounded-2xl bg-accent/30 border border-accent-border">
                <div className="flex-shrink-0 w-9 h-9 bg-chart-3 text-foreground rounded-xl flex items-center justify-center font-semibold text-sm">
                  !
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-base mb-1">Signing Secret</h3>
                  <p className="text-sm text-muted-foreground">
                    Copie o <strong>whsec_...</strong> do Stripe Dashboard e adicione como <code className="bg-card px-1.5 py-0.5 rounded text-xs">STRIPE_WEBHOOK_SECRET</code>
                  </p>
                </div>
              </div>

              <button
                onClick={() => window.open('https://dashboard.stripe.com/webhooks', '_blank')}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl bg-primary text-primary-foreground font-medium shadow-soft hover:opacity-90 transition-opacity"
                data-testid="button-open-stripe"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir Stripe Dashboard
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-products">
            <h2 className="text-[28px] font-semibold tracking-tight">Produtos & Ingressos</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-6">Nomenclatura dos produtos no Stripe</p>

            <div className="rounded-2xl bg-muted/50 border border-muted-border p-5 mb-4">
              <p className="text-sm font-medium mb-3">Formato do Nome:</p>
              <code className="block bg-card px-4 py-3 rounded-xl border border-card-border text-sm font-mono">
                [Data], [Hora] - [Tipo] Event Ticket
              </code>
            </div>

            <div className="space-y-2.5">
              {[
                "Feb 26th, 6 PM - Members Event Ticket",
                "Mar 15th, 7:30 PM - General Event Ticket",
                "Apr 1st, 5 PM - VIP Event Ticket",
              ].map((example, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/30">
                  <CheckCircle2 className="h-4 w-4 text-status-online flex-shrink-0" />
                  <code className="text-sm font-mono" data-testid={`text-example-${i}`}>{example}</code>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-accent/20 border border-accent-border p-4">
              <p className="text-sm font-medium mb-2">Tipos Suportados:</p>
              <div className="flex gap-3">
                {["Members", "General", "VIP"].map((type) => (
                  <span key={type} className="px-4 py-1.5 rounded-xl bg-card border border-card-border text-sm font-medium" data-testid={`badge-type-${type.toLowerCase()}`}>
                    {type}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </main>

        <aside className="hidden lg:block space-y-6">
          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-validation">
            <h3 className="text-lg font-semibold tracking-tight mb-4">Marco T0</h3>
            <div className="space-y-3">
              {[
                { done: true, text: "Stripe conectado" },
                { done: true, text: "Webhook recebendo eventos" },
                { done: true, text: "Assinatura validada" },
                { done: false, text: "Line items expandidos" },
                { done: false, text: "Dados do cliente extraídos" },
                { done: false, text: "Padrão de nome validado" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-status-online flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className={`text-sm ${item.done ? "text-foreground" : "text-muted-foreground"}`} data-testid={`text-checklist-${i}`}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: "50%" }} data-testid="progress-bar" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">3 de 6 completos</p>
          </div>

          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-monitor">
            <h3 className="text-lg font-semibold tracking-tight mb-4">Console</h3>
            <div className="rounded-2xl bg-foreground p-4 font-mono text-xs space-y-1.5">
              <div className="text-status-online">Webhook validado</div>
              <div className="text-chart-2">charge.succeeded</div>
              <div className="text-chart-2">payment_intent.succeeded</div>
              <div className="text-chart-2">payment_intent.created</div>
              <div className="text-chart-2">charge.updated</div>
            </div>
          </div>

          <div className="rounded-3xl border border-card-border bg-card p-5 shadow-card text-center" data-testid="card-footer">
            <p className="text-sm font-medium">Matcha On Ice</p>
            <p className="text-xs text-muted-foreground mt-1">San Diego, CA</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
