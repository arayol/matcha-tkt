import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Ticket, Settings, LogOut, CheckCircle2,
  Circle, XCircle, Calendar, ScanLine, Gift, Users,
  ChevronDown, Send, AlertCircle, Menu, X, Moon, Sun,
  Shield, Scan, Activity, AlertTriangle, ArrowRight,
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

interface EmailMonitoring {
  status: "critical" | "warning" | "healthy";
  gmail: {
    connected: boolean;
    senderEmail: string | null;
    error: string | null;
  };
  resend: {
    configured: boolean;
    senderEmail: string | null;
  };
  failedCount: number;
  uncertainCount: number;
  pendingCount: number;
  recoveredByResendCount: number;
  recentFailures: Array<{
    id: string;
    purchaserName: string;
    error: string;
    lastAttemptAt: string;
  }>;
}

const TICKET_TYPES = ["Members", "General", "VIP", "Staff"];

interface DashboardProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

export default function Dashboard({ dark, toggleTheme, onLogout, user }: DashboardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [courtesyForm, setCourtesyForm] = useState({
    eventId: "",
    name: "",
    email: "",
    ticketType: "Members",
  });
  const isAdmin = user.role === "adm";

  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"], enabled: isAdmin });
  const { data: ticketList } = useQuery<TicketData[]>({ queryKey: ["/api/tickets"], enabled: isAdmin });
  const { data: eventList } = useQuery<EventData[]>({ queryKey: ["/api/events"] });
  const { data: emailMonitoring, isLoading: emailMonitoringLoading } = useQuery<EmailMonitoring>({
    queryKey: ["/api/admin/email-monitoring"],
    enabled: isAdmin,
  });

  const courtesyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tickets/courtesy", {
        eventId: courtesyForm.eventId,
        purchaserName: courtesyForm.name,
        purchaserEmail: courtesyForm.email,
        ticketType: courtesyForm.ticketType,
      });
      return response.json();
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/email-monitoring"] });
      setCourtesyForm({ eventId: "", name: "", email: "", ticketType: "Members" });
      if (data.emailDelivery?.success) {
        toast({
          title: "Courtesy ticket created",
          description: data.emailDelivery?.provider === "resend"
            ? "Gmail failed, but the ticket was delivered through the Resend backup."
            : "The ticket has been sent to the recipient through Gmail.",
        });
      } else {
        toast({
          title: "Ticket created, email not sent",
          description: data.emailDelivery?.error || "The ticket is saved, but delivery requires attention.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({ title: "Failed to create ticket", variant: "destructive" });
    },
  });

  const generalCount = (ticketList || []).filter(
    (t) => t.ticketType.toLowerCase().includes("general") && t.status !== "cancelled"
  ).length;
  const membersCount = (ticketList || []).filter(
    (t) => t.ticketType.toLowerCase().includes("members") && t.status !== "cancelled"
  ).length;

  const drawerNav = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: ScanLine, label: "Scanner", href: "/scan" },
    { icon: Ticket, label: "Tickets", href: "/tickets", adminOnly: true },
    { icon: Gift, label: "Courtesy Ticket", href: "/courtesy" },
    ...(isAdmin ? [{ icon: Users, label: "User Management", href: "/admin/users", adminOnly: false }] : []),
  ];

  const sidebarNav = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: ScanLine, label: "Scanner", href: "/scan" },
    { icon: Ticket, label: "Tickets", href: "/tickets" },
    { icon: Gift, label: "Courtesy", href: "/courtesy" },
    ...(isAdmin ? [{ icon: Users, label: "Users", href: "/admin/users" }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="app-root">
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" data-testid="drawer-overlay">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className={`absolute left-0 top-0 bottom-0 w-72 p-5 flex flex-col shadow-2xl transition-transform ${dark ? "bg-[#111]" : "bg-card"}`}>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-semibold text-sm">Matcha On Ice</p>
                  <p className={`text-xs ${dark ? "text-gray-500" : "text-muted-foreground"}`}>Ticket Management</p>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} className={`p-1.5 rounded-lg ${dark ? "hover:bg-[#222]" : "hover:bg-muted"}`}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1">
              {drawerNav.map((item) => (
                <button
                  key={item.label}
                  onClick={() => { navigate(item.href); setDrawerOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    dark ? "hover:bg-[#222] text-gray-300" : "hover:bg-muted text-foreground"
                  }`}
                  data-testid={`drawer-${item.label.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className={`border-t pt-4 mt-4 space-y-2 ${dark ? "border-[#222]" : "border-card-border"}`}>
              <div className={`flex items-center gap-3 px-3 py-2 rounded-xl ${dark ? "bg-[#1a1a1a]" : "bg-muted/30"}`}>
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${dark ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"}`}>
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-medium">{user.username}</p>
                  <p className={`text-[10px] ${dark ? "text-gray-500" : "text-muted-foreground"}`}>{user.role === "adm" ? "Admin" : "User"}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition-colors`}
                data-testid="drawer-logout"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <header className={`md:hidden flex items-center justify-between px-4 py-3 border-b ${dark ? "bg-[#111] border-[#222]" : "bg-card border-card-border"}`}>
        <button
          onClick={() => setDrawerOpen(true)}
          className={`p-2 rounded-xl ${dark ? "hover:bg-[#222]" : "hover:bg-muted"}`}
          data-testid="button-hamburger"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="font-semibold text-sm">Matcha On Ice</span>
        <button onClick={toggleTheme} className={`p-2 rounded-xl ${dark ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-foreground"}`} data-testid="button-theme-mobile">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <div className="mx-auto grid max-w-[1440px] md:grid-cols-[88px_1fr] gap-6 p-4 md:p-6 lg:grid-cols-[88px_1fr_320px]">

        <aside className="hidden md:flex min-h-[calc(100vh-48px)] flex-col items-center justify-between rounded-[32px] border border-sidebar-border bg-sidebar px-4 py-6 shadow-card" data-testid="sidebar">
          <div className="flex flex-col items-center gap-6">
            <nav className="flex flex-col gap-4">
              {sidebarNav.map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.href)}
                  title={item.label}
                  className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors text-muted-foreground hover:bg-sidebar-accent hover:text-primary"
                  data-testid={`nav-${item.label.toLowerCase()}`}
                >
                  <item.icon className="h-5 w-5" />
                </button>
              ))}
            </nav>
          </div>
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={toggleTheme}
              title="Toggle theme"
              className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors text-muted-foreground hover:bg-sidebar-accent"
              data-testid="button-theme-sidebar"
            >
              {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={onLogout}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-primary hover:bg-sidebar-accent transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </aside>

        <main className="space-y-6 min-w-0">
          <div className="hidden md:flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-title">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-1">Matcha On Ice · Ticket Management</p>
            </div>
          </div>

          {isAdmin && <div className="grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-4">
            <div className="rounded-3xl border border-card-border bg-card p-4 md:p-5 shadow-card" data-testid="stat-total-tickets">
              <Ticket className="h-5 w-5 mb-2 md:mb-3 text-primary" />
              <p className="text-2xl font-semibold">{stats?.totalTickets ?? 0}</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">Total Tickets</p>
            </div>

            <div className="rounded-3xl border border-card-border bg-card p-4 md:p-5 shadow-card" data-testid="stat-valid-used">
              <CheckCircle2 className="h-5 w-5 mb-2 md:mb-3 text-status-online" />
              <p className="text-2xl font-semibold">{stats?.validTickets ?? 0}<span className="text-base text-muted-foreground font-normal"> / {stats?.usedTickets ?? 0}</span></p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">Valid / Used</p>
            </div>

            <div className="rounded-3xl border border-card-border bg-card p-4 md:p-5 shadow-card" data-testid="stat-general">
              <Scan className="h-5 w-5 mb-2 md:mb-3 text-chart-3" />
              <p className="text-2xl font-semibold">{generalCount}</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">General Admission</p>
            </div>

            <div className="rounded-3xl border border-card-border bg-card p-4 md:p-5 shadow-card" data-testid="stat-members">
              <Users className="h-5 w-5 mb-2 md:mb-3 text-chart-2" />
              <p className="text-2xl font-semibold">{membersCount}</p>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">Members</p>
            </div>
          </div>}

          {eventList && eventList.length > 0 && (
            <div className="rounded-3xl border border-card-border bg-card p-4 md:p-6 shadow-card" data-testid="card-events">
              <h2 className="text-lg md:text-[22px] font-semibold tracking-tight">Events</h2>
              <p className="text-xs md:text-sm text-muted-foreground mt-1 mb-4 md:mb-5">Active events</p>
              <div className="space-y-2 md:space-y-3">
                {eventList.map((event) => {
                  const eventTickets = (ticketList || []).filter((t) => t.eventId === event.id);
                  const validCount = eventTickets.filter((t) => t.status === "valid").length;
                  const usedCount = eventTickets.filter((t) => t.status === "used").length;
                  return (
                    <div key={event.id} className="flex items-center gap-3 md:gap-4 px-3 md:px-4 py-2.5 md:py-3 rounded-2xl bg-muted/30 border border-muted-border" data-testid={`event-${event.id}`}>
                      <div className="flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-xl bg-primary/10 text-primary flex-shrink-0">
                        <Calendar className="h-4 w-4 md:h-5 md:w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs md:text-sm truncate">{event.name}</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground">{event.date} at {event.time}</p>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs text-muted-foreground flex-shrink-0">
                        <span className="text-status-online font-medium">{validCount} valid</span>
                        <span>·</span>
                        <span>{usedCount} used</span>
                      </div>
                      <span className="hidden md:inline px-3 py-1 rounded-xl bg-primary/10 text-primary text-xs font-medium flex-shrink-0">
                        {event.eventType}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {isAdmin && <div
            className={`rounded-3xl border p-4 md:p-6 shadow-card ${
              emailMonitoring?.status === "critical"
                ? "border-red-300 bg-red-50/80 dark:border-red-900 dark:bg-red-950/30"
                : emailMonitoring?.status === "warning"
                  ? "border-amber-300 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30"
                  : "border-card-border bg-card"
            }`}
            data-testid="card-email-monitoring"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  emailMonitoring?.status === "critical"
                    ? "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300"
                    : emailMonitoring?.status === "warning"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      : "bg-primary/10 text-primary"
                }`}>
                  {emailMonitoring?.status === "critical"
                    ? <AlertTriangle className="h-5 w-5" />
                    : <Activity className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-lg md:text-[22px] font-semibold tracking-tight">Monitoring &amp; Alerts</h2>
                  <p className="text-xs md:text-sm text-muted-foreground mt-0.5">Ticket email delivery</p>
                </div>
              </div>
              {!emailMonitoringLoading && (
                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  emailMonitoring?.status === "critical"
                    ? "bg-red-600 text-white"
                    : emailMonitoring?.status === "warning"
                      ? "bg-amber-500 text-white"
                      : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                }`}>
                  {emailMonitoring?.status === "critical"
                    ? "Critical"
                    : emailMonitoring?.status === "warning"
                      ? "Warning"
                      : "Healthy"}
                </span>
              )}
            </div>

            {emailMonitoringLoading || !emailMonitoring ? (
              <p className="mt-5 text-sm text-muted-foreground">Checking Gmail, Resend, and recent delivery attempts...</p>
            ) : emailMonitoring.status === "critical" ? (
              <div className="mt-5 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Occurrence</p>
                  <p className="mt-1 text-sm font-medium text-red-950 dark:text-red-100">
                    {emailMonitoring.failedCount > 0
                      ? `${emailMonitoring.failedCount} ticket email${emailMonitoring.failedCount === 1 ? " has" : "s have"} no confirmed delivery.`
                      : emailMonitoring.uncertainCount > 0
                        ? `${emailMonitoring.uncertainCount} ticket email outcome${emailMonitoring.uncertainCount === 1 ? " is" : "s are"} uncertain and needs review.`
                      : "Gmail is unavailable and Resend is not configured."}
                  </p>
                  <p className="mt-1 text-xs text-red-800/80 dark:text-red-200/70">
                    {emailMonitoring.recentFailures[0]?.error || emailMonitoring.gmail.error || "Email delivery failed."}
                  </p>
                </div>
                <div className="rounded-2xl border border-red-200 bg-white/60 px-4 py-3 dark:border-red-900 dark:bg-black/10">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Consequence</p>
                  <p className="mt-1 text-sm text-red-950 dark:text-red-100">
                    Customers may have valid tickets in the system without receiving the ticket email or PDF.
                  </p>
                </div>
                <button
                  onClick={() => navigate("/tickets")}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                  data-testid="button-review-email-failures"
                >
                  Review affected tickets
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : emailMonitoring.status === "warning" ? (
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-amber-100/70 px-4 py-3 dark:bg-amber-950/40">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700 dark:text-amber-300" />
                <div>
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    {!emailMonitoring.gmail.connected
                      ? "Gmail is unavailable. Resend fallback is protecting ticket delivery."
                      : emailMonitoring.recoveredByResendCount === 1
                        ? "1 delivery was recovered by Resend."
                        : `${emailMonitoring.recoveredByResendCount} deliveries were recovered by Resend.`}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/70">
                    {emailMonitoring.resend.configured
                      ? `Fallback sender: ${emailMonitoring.resend.senderEmail || "Resend configured"}`
                      : "Resend fallback is not configured."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-green-50 px-4 py-3 dark:bg-green-950/30">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">Gmail primary and Resend fallback are ready.</p>
                  <p className="mt-0.5 text-xs text-green-700/70 dark:text-green-300/70">
                    {emailMonitoring.gmail.senderEmail || "Ticket delivery is operational."} · Resend backup configured
                  </p>
                </div>
              </div>
            )}
          </div>}
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
                    onChange={(e) => setCourtesyForm((f) => ({ ...f, eventId: e.target.value }))}
                    className="w-full appearance-none bg-muted/40 border border-card-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 text-foreground pr-8"
                    data-testid="select-courtesy-event"
                  >
                    <option value="">Select event...</option>
                    {(eventList || []).map((e) => (
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
                  onChange={(e) => setCourtesyForm((f) => ({ ...f, name: e.target.value }))}
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
                  onChange={(e) => setCourtesyForm((f) => ({ ...f, email: e.target.value }))}
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
                    onChange={(e) => setCourtesyForm((f) => ({ ...f, ticketType: e.target.value }))}
                    className="w-full appearance-none bg-muted/40 border border-card-border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 text-foreground pr-8"
                    data-testid="select-courtesy-type"
                  >
                    {TICKET_TYPES.map((t) => (
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
                  courtesyMutation.mutate();
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
        </aside>
      </div>
    </div>
  );
}
