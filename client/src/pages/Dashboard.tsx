import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Ticket, Settings, LogOut, Search, CheckCircle2, Circle, ExternalLink, Users, Calendar, TrendingUp } from "lucide-react";

interface Stats {
  totalTickets: number;
  validTickets: number;
  usedTickets: number;
  totalEvents: number;
}

interface TicketData {
  id: string;
  eventId: string;
  purchaserName: string;
  purchaserEmail: string;
  ticketType: string;
  ticketUrl: string;
  status: string;
  purchasedAt: string;
}

interface EventData {
  id: string;
  name: string;
  date: string;
  time: string;
  eventType: string;
  location: string;
}

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState(0);

  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: ticketList } = useQuery<TicketData[]>({ queryKey: ["/api/tickets"] });
  const { data: eventList } = useQuery<EventData[]>({ queryKey: ["/api/events"] });

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: Ticket, label: "Tickets" },
    { icon: Settings, label: "Settings" },
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
          <button className="flex h-11 w-11 items-center justify-center rounded-xl text-primary hover:bg-sidebar-accent transition-colors" data-testid="button-logout">
            <LogOut className="h-5 w-5" />
          </button>
        </aside>

        <main className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-title">My Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">Matcha On Ice - Ticket Management</p>
            </div>
            <div className="flex h-12 w-[260px] items-center gap-3 rounded-2xl bg-card px-4 shadow-soft border border-card-border">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Search anything..." data-testid="input-search" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Total Tickets", value: stats?.totalTickets ?? 0, icon: Ticket, color: "text-primary" },
              { label: "Valid Tickets", value: stats?.validTickets ?? 0, icon: CheckCircle2, color: "text-status-online" },
              { label: "Used Tickets", value: stats?.usedTickets ?? 0, icon: TrendingUp, color: "text-chart-3" },
              { label: "Total Events", value: stats?.totalEvents ?? 0, icon: Calendar, color: "text-chart-2" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-3xl border border-card-border bg-card p-5 shadow-card" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {eventList && eventList.length > 0 && (
            <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-events">
              <h2 className="text-[28px] font-semibold tracking-tight">Events</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-5">Active events from Stripe</p>
              <div className="space-y-3">
                {eventList.map((event) => (
                  <div key={event.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-muted/30 border border-muted-border" data-testid={`event-${event.id}`}>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{event.name}</p>
                      <p className="text-xs text-muted-foreground">{event.date} at {event.time} &middot; {event.location}</p>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-primary/10 text-primary text-xs font-medium">
                      {event.eventType}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-tickets">
            <h2 className="text-[28px] font-semibold tracking-tight">Recent Tickets</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              {ticketList && ticketList.length > 0
                ? `${ticketList.length} ticket${ticketList.length > 1 ? "s" : ""} total`
                : "No tickets yet - waiting for Stripe checkout events"
              }
            </p>

            {ticketList && ticketList.length > 0 ? (
              <div className="space-y-3">
                {ticketList.slice(0, 10).map((ticket) => (
                  <div key={ticket.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-muted/30 border border-muted-border" data-testid={`ticket-${ticket.id}`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      ticket.status === "valid" ? "bg-green-50 dark:bg-green-950/30 text-status-online" :
                      ticket.status === "used" ? "bg-yellow-50 dark:bg-yellow-950/30 text-status-away" :
                      "bg-red-50 dark:bg-red-950/30 text-status-busy"
                    }`}>
                      {ticket.status === "valid" ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{ticket.purchaserName}</p>
                      <p className="text-xs text-muted-foreground truncate">{ticket.purchaserEmail}</p>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 rounded-xl bg-primary/10 text-primary text-xs font-medium">
                        {ticket.ticketType}
                      </span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {ticket.purchasedAt ? new Date(ticket.purchasedAt).toLocaleDateString() : ""}
                      </p>
                    </div>
                    <a
                      href={`/ticket/${ticket.ticketUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-sidebar-accent transition-colors text-muted-foreground"
                      data-testid={`link-ticket-${ticket.id}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Tickets will appear here after a Stripe checkout</p>
              </div>
            )}
          </div>
        </main>

        <aside className="hidden lg:block space-y-6">
          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-checklist">
            <h3 className="text-lg font-semibold tracking-tight mb-4">Marco M1 Status</h3>
            <div className="space-y-3">
              {[
                { done: true, text: "Database schema" },
                { done: true, text: "QR code generation" },
                { done: true, text: "Webhook handler" },
                { done: true, text: "API routes" },
                { done: true, text: "Ticket display page" },
                { done: true, text: "Dashboard with live data" },
                { done: true, text: "Courtesy tickets" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${item.done ? "text-status-online" : "text-muted-foreground"}`} />
                  <span className={`text-sm ${item.done ? "text-foreground" : "text-muted-foreground"}`} data-testid={`text-checklist-${i}`}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-5 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: "100%" }} data-testid="progress-bar" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">7 of 7 complete</p>
          </div>

          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-quick-actions">
            <h3 className="text-lg font-semibold tracking-tight mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => window.open("https://dashboard.stripe.com/test/webhooks", "_blank")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-sidebar-accent transition-colors text-sm"
                data-testid="button-stripe-webhooks"
              >
                <ExternalLink className="h-4 w-4 text-primary" />
                Stripe Webhooks
              </button>
              <button
                onClick={() => window.open("https://dashboard.stripe.com/test/products", "_blank")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-sidebar-accent transition-colors text-sm"
                data-testid="button-stripe-products"
              >
                <ExternalLink className="h-4 w-4 text-primary" />
                Stripe Products
              </button>
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
