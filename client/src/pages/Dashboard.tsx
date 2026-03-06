import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Ticket, Settings, LogOut, Search,
  CheckCircle2, Circle, XCircle, ExternalLink, Calendar,
  TrendingUp, ScanLine, Gift, DollarSign, Users, BarChart3,
  ChevronDown, Send, AlertCircle,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Stats {
  totalTickets: number;
  validTickets: number;
  usedTickets: number;
  cancelledTickets: number;
  courtesyTickets: number;
  totalEvents: number;
  totalRevenueCents: number;
  byType: Record<string, number>;
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
  stripeSessionId: string | null;
}

interface EventData {
  id: string;
  name: string;
  date: string;
  time: string;
  eventType: string;
  location: string;
}

const TICKET_TYPES = ["Members", "General", "VIP", "Staff"];
type FilterTab = "all" | "valid" | "used" | "courtesy" | "cancelled";

function formatRevenue(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [courtesyForm, setCourtesyForm] = useState({
    eventId: "",
    name: "",
    email: "",
    ticketType: "Members",
  });

  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"] });
  const { data: ticketList } = useQuery<TicketData[]>({ queryKey: ["/api/tickets"] });
  const { data: eventList } = useQuery<EventData[]>({ queryKey: ["/api/events"] });

  const courtesyMutation = useMutation({
    mutationFn: (body: typeof courtesyForm) => apiRequest("POST", "/api/tickets/courtesy", body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setCourtesyForm({ eventId: "", name: "", email: "", ticketType: "Members" });
      toast({ title: "Courtesy ticket created", description: "The ticket has been sent to the recipient." });
    },
    onError: () => {
      toast({ title: "Failed to create ticket", variant: "destructive" });
    },
  });

  const filteredTickets = (ticketList || []).filter(t => {
    if (activeFilter === "all") return true;
    if (activeFilter === "courtesy") return !t.stripeSessionId;
    return t.status === activeFilter;
  });

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: ScanLine, label: "Scanner", href: "/scan" },
    { icon: Ticket, label: "Tickets", href: "/" },
    { icon: Settings, label: "Settings", href: "/" },
  ];

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: ticketList?.length || 0 },
    { key: "valid", label: "Valid", count: stats?.validTickets || 0 },
    { key: "used", label: "Used", count: stats?.usedTickets || 0 },
    { key: "courtesy", label: "Courtesy", count: stats?.courtesyTickets || 0 },
    { key: "cancelled", label: "Cancelled", count: stats?.cancelledTickets || 0 },
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
              {navItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.href)}
                  title={item.label}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                    item.label === "Scanner"
                      ? "text-muted-foreground hover:bg-sidebar-accent hover:text-primary"
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

        <main className="space-y-6 min-w-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-title">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">Matcha On Ice · Ticket Management</p>
            </div>
            <div className="flex h-12 w-[260px] items-center gap-3 rounded-2xl bg-card px-4 shadow-soft border border-card-border">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Search..." data-testid="input-search" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "Total Tickets", value: stats?.totalTickets ?? 0, icon: Ticket, color: "text-primary" },
              { label: "Valid", value: stats?.validTickets ?? 0, icon: CheckCircle2, color: "text-status-online" },
              { label: "Used", value: stats?.usedTickets ?? 0, icon: TrendingUp, color: "text-chart-3" },
              { label: "Events", value: stats?.totalEvents ?? 0, icon: Calendar, color: "text-chart-2" },
              {
                label: "Revenue",
                value: formatRevenue(stats?.totalRevenueCents ?? 0),
                icon: DollarSign,
                color: "text-chart-1",
              },
            ].map((stat) => (
              <div key={stat.label} className="rounded-3xl border border-card-border bg-card p-5 shadow-card" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
                <stat.icon className={`h-5 w-5 mb-3 ${stat.color}`} />
                <p className="text-2xl font-semibold">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {eventList && eventList.length > 0 && (
            <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-events">
              <h2 className="text-[22px] font-semibold tracking-tight">Events</h2>
              <p className="text-sm text-muted-foreground mt-1 mb-5">Active events</p>
              <div className="space-y-3">
                {eventList.map((event) => {
                  const eventTickets = (ticketList || []).filter(t => t.eventId === event.id);
                  const validCount = eventTickets.filter(t => t.status === "valid").length;
                  const usedCount = eventTickets.filter(t => t.status === "used").length;
                  return (
                    <div key={event.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-muted/30 border border-muted-border" data-testid={`event-${event.id}`}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{event.name}</p>
                        <p className="text-xs text-muted-foreground">{event.date} at {event.time}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-status-online font-medium">{validCount} valid</span>
                        <span>·</span>
                        <span>{usedCount} used</span>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                        {event.eventType}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-tickets">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-[22px] font-semibold tracking-tight">Tickets</h2>
                <p className="text-sm text-muted-foreground mt-1">{ticketList?.length || 0} total</p>
              </div>
            </div>

            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {filterTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                    activeFilter === tab.key
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                  }`}
                  data-testid={`filter-${tab.key}`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-lg ${
                    activeFilter === tab.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>

            {filteredTickets.length > 0 ? (
              <div className="space-y-2">
                {filteredTickets.slice(0, 15).map((ticket) => (
                  <div key={ticket.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl bg-muted/30 border border-muted-border" data-testid={`ticket-${ticket.id}`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${
                      ticket.status === "valid" ? "bg-green-50 dark:bg-green-950/30 text-status-online" :
                      ticket.status === "used" ? "bg-yellow-50 dark:bg-yellow-950/30 text-status-away" :
                      "bg-red-50 dark:bg-red-950/30 text-status-busy"
                    }`}>
                      {ticket.status === "valid" ? <CheckCircle2 className="h-5 w-5" /> :
                       ticket.status === "used" ? <Circle className="h-5 w-5" /> :
                       <XCircle className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{ticket.purchaserName}</p>
                        {!ticket.stripeSessionId && (
                          <span className="text-xs px-2 py-0.5 rounded-lg bg-primary/10 text-primary font-medium">Courtesy</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{ticket.purchaserEmail}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="px-3 py-1 rounded-xl bg-muted/50 text-foreground text-xs font-medium">
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
                      className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-sidebar-accent transition-colors text-muted-foreground flex-shrink-0"
                      data-testid={`link-ticket-${ticket.id}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                ))}
                {filteredTickets.length > 15 && (
                  <p className="text-center text-xs text-muted-foreground pt-2">
                    Showing 15 of {filteredTickets.length} tickets
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No tickets in this category</p>
              </div>
            )}
          </div>
        </main>

        <aside className="hidden lg:block space-y-5">
          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-courtesy-form">
            <div className="flex items-center gap-2 mb-5">
              <Gift className="h-5 w-5 text-primary" />
              <h3 className="text-[18px] font-semibold tracking-tight">Courtesy Ticket</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Event</label>
                <div className="relative">
                  <select
                    value={courtesyForm.eventId}
                    onChange={e => setCourtesyForm(f => ({ ...f, eventId: e.target.value }))}
                    className="w-full appearance-none bg-muted/40 border border-card-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 text-foreground pr-8"
                    data-testid="select-courtesy-event"
                  >
                    <option value="">Select event...</option>
                    {(eventList || []).map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
                <input
                  value={courtesyForm.name}
                  onChange={e => setCourtesyForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Recipient name"
                  className="w-full bg-muted/40 border border-card-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                  data-testid="input-courtesy-name"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email</label>
                <input
                  type="email"
                  value={courtesyForm.email}
                  onChange={e => setCourtesyForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full bg-muted/40 border border-card-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                  data-testid="input-courtesy-email"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ticket Type</label>
                <div className="relative">
                  <select
                    value={courtesyForm.ticketType}
                    onChange={e => setCourtesyForm(f => ({ ...f, ticketType: e.target.value }))}
                    className="w-full appearance-none bg-muted/40 border border-card-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 text-foreground pr-8"
                    data-testid="select-courtesy-type"
                  >
                    {TICKET_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {courtesyMutation.isError && (
                <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl" data-testid="text-courtesy-error">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  Failed to create ticket. Check all fields.
                </div>
              )}

              <button
                onClick={() => {
                  if (!courtesyForm.eventId || !courtesyForm.name || !courtesyForm.email) return;
                  courtesyMutation.mutate(courtesyForm);
                }}
                disabled={courtesyMutation.isPending || !courtesyForm.eventId || !courtesyForm.name || !courtesyForm.email}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-2xl font-medium text-sm shadow-soft hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                data-testid="button-create-courtesy"
              >
                <Send className="h-4 w-4" />
                {courtesyMutation.isPending ? "Creating..." : "Create Ticket"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-card-border bg-card p-6 shadow-card" data-testid="card-sales-report">
            <div className="flex items-center gap-2 mb-5">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h3 className="text-[18px] font-semibold tracking-tight">Sales Report</h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Revenue</span>
                <span className="text-lg font-semibold text-chart-1" data-testid="text-total-revenue">
                  {formatRevenue(stats?.totalRevenueCents ?? 0)}
                </span>
              </div>

              <div className="h-px border-t border-dashed border-border" />

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-status-online" />
                    <span className="text-muted-foreground">Valid</span>
                  </div>
                  <span className="font-medium" data-testid="text-valid-count">{stats?.validTickets ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-status-away" />
                    <span className="text-muted-foreground">Used</span>
                  </div>
                  <span className="font-medium" data-testid="text-used-count">{stats?.usedTickets ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full bg-primary/60" />
                    <span className="text-muted-foreground">Courtesy</span>
                  </div>
                  <span className="font-medium" data-testid="text-courtesy-count">{stats?.courtesyTickets ?? 0}</span>
                </div>
              </div>

              {stats?.byType && Object.keys(stats.byType).length > 0 && (
                <>
                  <div className="h-px border-t border-dashed border-border" />
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Type</p>
                    {Object.entries(stats.byType).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{type}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 rounded-full bg-primary/30 w-16 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.round((count / (stats.totalTickets || 1)) * 100)}%` }}
                            />
                          </div>
                          <span className="font-medium w-4 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="h-px border-t border-dashed border-border" />

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span>{stats?.totalTickets ?? 0} total tickets · {stats?.totalEvents ?? 0} events</span>
              </div>
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
