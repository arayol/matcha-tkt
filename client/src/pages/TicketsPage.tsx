import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, CheckCircle2, Circle, XCircle,
  ExternalLink, Ticket, Archive, CalendarDays,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";

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
  issuedBy: string | null;
  eventName: string;
  eventDate: string;
  calendarDate: string | null;
  archived: boolean;
}

type FilterTab = "all" | "valid" | "used" | "courtesy" | "cancelled" | "archived";

interface TicketsPageProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

export default function TicketsPage({ dark, toggleTheme, onLogout, user }: TicketsPageProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: ticketList } = useQuery<TicketData[]>({ queryKey: ["/api/tickets"] });
  const upcomingTickets = useMemo(() => (ticketList || []).filter(t => !t.archived), [ticketList]);
  const archivedTickets = useMemo(() => (ticketList || []).filter(t => t.archived), [ticketList]);

  const upcomingStats = useMemo(() => {
    const valid = upcomingTickets.filter(t => t.status === "valid").length;
    const used = upcomingTickets.filter(t => t.status === "used").length;
    const cancelled = upcomingTickets.filter(t => t.status === "cancelled").length;
    const courtesy = upcomingTickets.filter(t => !t.stripeSessionId).length;
    return { valid, used, cancelled, courtesy };
  }, [upcomingTickets]);

  const filtered = useMemo(() => {
    const source = activeFilter === "archived" ? archivedTickets : upcomingTickets;
    return source.filter((t) => {
      const matchesFilter =
        activeFilter === "all" || activeFilter === "archived" ||
        (activeFilter === "courtesy" ? !t.stripeSessionId : t.status === activeFilter);
      const s = search.toLowerCase();
      const matchesSearch =
        !search ||
        t.purchaserName.toLowerCase().includes(s) ||
        t.purchaserEmail.toLowerCase().includes(s) ||
        t.ticketType.toLowerCase().includes(s) ||
        t.eventName.toLowerCase().includes(s) ||
        t.eventDate.toLowerCase().includes(s);
      let matchesDate = true;
      if (dateFrom || dateTo) {
        const pDate = t.purchasedAt ? new Date(t.purchasedAt) : null;
        if (pDate) {
          if (dateFrom && pDate < new Date(dateFrom)) matchesDate = false;
          if (dateTo) {
            const toEnd = new Date(dateTo);
            toEnd.setHours(23, 59, 59, 999);
            if (pDate > toEnd) matchesDate = false;
          }
        } else {
          matchesDate = false;
        }
      }
      return matchesFilter && matchesSearch && matchesDate;
    }).sort((a, b) => {
      const da = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
      const db = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
      return db - da;
    });
  }, [activeFilter, upcomingTickets, archivedTickets, search, dateFrom, dateTo]);

  const filterTabs: { key: FilterTab; label: string; count: number; icon?: typeof Archive }[] = [
    { key: "all", label: "All", count: upcomingTickets.length },
    { key: "valid", label: "Valid", count: upcomingStats.valid },
    { key: "used", label: "Used", count: upcomingStats.used },
    { key: "courtesy", label: "Courtesy", count: upcomingStats.courtesy },
    { key: "cancelled", label: "Cancelled", count: upcomingStats.cancelled },
    { key: "archived", label: "Archived", count: archivedTickets.length, icon: Archive },
  ];

  return (
    <AppLayout dark={dark} toggleTheme={toggleTheme} onLogout={onLogout} user={user} activePath="/tickets" data-testid="tickets-page">
      <div className="space-y-6">
        <div className="hidden md:flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-title">Tickets</h1>
            <p className="text-sm text-muted-foreground mt-1">Matcha On Ice · All Tickets</p>
          </div>
        </div>

        <div className="rounded-3xl border border-card-border bg-card shadow-card overflow-hidden" data-testid="tickets-card">
          <div className="px-4 md:px-6 py-4 space-y-3 border-b border-card-border">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, email, event, date, or class type..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                  data-testid="input-ticket-search"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-2 py-2 rounded-xl text-xs outline-none bg-muted/40 border border-card-border text-muted-foreground focus:ring-2 focus:ring-primary/30 w-[130px]"
                  data-testid="input-date-from"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-2 py-2 rounded-xl text-xs outline-none bg-muted/40 border border-card-border text-muted-foreground focus:ring-2 focus:ring-primary/30 w-[130px]"
                  data-testid="input-date-to"
                />
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                    activeFilter === tab.key
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                  }`}
                  data-testid={`filter-${tab.key}`}
                >
                  {tab.icon && <tab.icon className="h-3 w-3" />}
                  {tab.label}
                  <span className={`text-[10px] px-1 py-0.5 rounded-md ${
                    activeFilter === tab.key ? "bg-primary-foreground/20" : "bg-muted"
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[calc(100vh-320px)] md:max-h-[calc(100vh-280px)] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Ticket className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {search ? "No matching tickets" : activeFilter === "archived" ? "No archived tickets" : "No tickets in this category"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-card-border">
                {filtered.map((ticket) => (
                  <div
                    key={ticket.id}
                    className={`flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-muted/30 transition-colors ${ticket.archived ? "opacity-60" : ""}`}
                    data-testid={`ticket-${ticket.id}`}
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                      ticket.status === "valid"
                        ? "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400"
                        : ticket.status === "used"
                        ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-950/30 dark:text-yellow-400"
                        : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                    }`}>
                      {ticket.status === "valid" ? <CheckCircle2 className="h-4 w-4" /> :
                       ticket.status === "used" ? <Circle className="h-4 w-4" /> :
                       <XCircle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate">{ticket.purchaserName}</p>
                        {!ticket.stripeSessionId && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-primary/10 text-primary">Courtesy</span>
                        )}
                        {!ticket.stripeSessionId && ticket.issuedBy && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-muted text-muted-foreground" data-testid={`badge-issuer-${ticket.id}`}>by {ticket.issuedBy}</span>
                        )}
                      </div>
                      <p className="text-xs truncate text-muted-foreground">{ticket.purchaserEmail}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-muted/50 text-foreground">
                        {ticket.ticketType}
                      </span>
                      <p className="text-[10px] mt-0.5 text-muted-foreground">
                        {ticket.purchasedAt ? new Date(ticket.purchasedAt).toLocaleDateString() : ""}
                      </p>
                    </div>
                    <a
                      href={`/ticket/${ticket.ticketUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 text-muted-foreground hover:bg-muted/50 transition-colors"
                      data-testid={`link-ticket-${ticket.id}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
