import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, CheckCircle2, Circle, XCircle,
  ExternalLink, Ticket,
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
}

interface Stats {
  totalTickets: number;
  validTickets: number;
  usedTickets: number;
  cancelledTickets: number;
  courtesyTickets: number;
}

type FilterTab = "all" | "valid" | "used" | "courtesy" | "cancelled";

interface TicketsPageProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

export default function TicketsPage({ dark, toggleTheme, onLogout, user }: TicketsPageProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const { data: ticketList } = useQuery<TicketData[]>({ queryKey: ["/api/tickets"] });
  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/stats"] });

  const filtered = (ticketList || []).filter((t) => {
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "courtesy" ? !t.stripeSessionId : t.status === activeFilter);
    const matchesSearch =
      !search ||
      t.purchaserName.toLowerCase().includes(search.toLowerCase()) ||
      t.purchaserEmail.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: ticketList?.length || 0 },
    { key: "valid", label: "Valid", count: stats?.validTickets || 0 },
    { key: "used", label: "Used", count: stats?.usedTickets || 0 },
    { key: "courtesy", label: "Courtesy", count: stats?.courtesyTickets || 0 },
    { key: "cancelled", label: "Cancelled", count: stats?.cancelledTickets || 0 },
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                data-testid="input-ticket-search"
              />
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
                  {search ? "No matching tickets" : "No tickets in this category"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-card-border">
                {filtered.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center gap-3 px-4 md:px-6 py-3 hover:bg-muted/30 transition-colors"
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
