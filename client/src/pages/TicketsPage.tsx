import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Search, CheckCircle2, Circle, XCircle,
  ExternalLink, Ticket, Moon, Sun,
} from "lucide-react";

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

export default function TicketsPage({ dark, toggleTheme }: { dark: boolean; toggleTheme: () => void }) {
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
    <div className={`min-h-screen flex flex-col ${dark ? "bg-[#0a0a0a] text-white" : "bg-background text-foreground"}`} data-testid="tickets-page">
      <header className={`flex items-center justify-between px-4 py-3 border-b ${dark ? "bg-[#111] border-[#222]" : "bg-card border-card-border"}`}>
        <Link href="/" className={`flex items-center gap-1.5 text-sm ${dark ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-foreground"} transition-colors`} data-testid="link-back">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
        <h1 className="font-semibold text-base">Tickets</h1>
        <button onClick={toggleTheme} className={`p-2 rounded-xl ${dark ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-foreground"}`} data-testid="button-theme-tickets">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <div className={`px-4 py-3 space-y-3 border-b ${dark ? "border-[#222]" : "border-card-border"}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${dark ? "text-gray-600" : "text-muted-foreground"}`} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none ${dark ? "bg-[#161616] border border-[#222] text-white placeholder-gray-600 focus:border-primary" : "bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"}`}
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
                  : dark
                  ? "bg-[#161616] text-gray-400 hover:text-white"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
              }`}
              data-testid={`filter-${tab.key}`}
            >
              {tab.label}
              <span className={`text-[10px] px-1 py-0.5 rounded-md ${
                activeFilter === tab.key ? "bg-primary-foreground/20" : dark ? "bg-[#222]" : "bg-muted"
              }`}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Ticket className={`h-10 w-10 ${dark ? "text-gray-700" : "text-muted-foreground/30"}`} />
            <p className={`text-sm ${dark ? "text-gray-500" : "text-muted-foreground"}`}>
              {search ? "No matching tickets" : "No tickets in this category"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-transparent">
            {filtered.map((ticket) => (
              <div
                key={ticket.id}
                className={`flex items-center gap-3 px-4 py-3 ${dark ? "hover:bg-[#161616]" : "hover:bg-muted/30"} transition-colors`}
                data-testid={`ticket-${ticket.id}`}
              >
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                  ticket.status === "valid"
                    ? dark ? "bg-green-950/30 text-green-400" : "bg-green-50 text-green-600"
                    : ticket.status === "used"
                    ? dark ? "bg-yellow-950/30 text-yellow-400" : "bg-yellow-50 text-yellow-600"
                    : dark ? "bg-red-950/30 text-red-400" : "bg-red-50 text-red-600"
                }`}>
                  {ticket.status === "valid" ? <CheckCircle2 className="h-4 w-4" /> :
                   ticket.status === "used" ? <Circle className="h-4 w-4" /> :
                   <XCircle className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{ticket.purchaserName}</p>
                    {!ticket.stripeSessionId && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${dark ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary"}`}>Courtesy</span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${dark ? "text-gray-500" : "text-muted-foreground"}`}>{ticket.purchaserEmail}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${dark ? "bg-[#222] text-gray-300" : "bg-muted/50 text-foreground"}`}>
                    {ticket.ticketType}
                  </span>
                  <p className={`text-[10px] mt-0.5 ${dark ? "text-gray-600" : "text-muted-foreground"}`}>
                    {ticket.purchasedAt ? new Date(ticket.purchasedAt).toLocaleDateString() : ""}
                  </p>
                </div>
                <a
                  href={`/ticket/${ticket.ticketUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 ${dark ? "text-gray-600 hover:text-white hover:bg-[#222]" : "text-muted-foreground hover:bg-muted/50"} transition-colors`}
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
  );
}
