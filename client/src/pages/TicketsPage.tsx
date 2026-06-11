import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Search, CheckCircle2, Circle, XCircle, AlertTriangle,
  ExternalLink, Ticket, Archive, CalendarDays, RotateCcw, Loader2, Pencil, Mail,
} from "lucide-react";
import deleteTicketIcon from "@assets/delete-ticket-32_1775730554904.png";
import AppLayout from "@/components/AppLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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

interface EventData {
  id: string;
  name: string;
  date: string;
  eventType: string;
  calendarDate: string | null;
}

type FilterTab = "all" | "valid" | "used" | "courtesy" | "cancelled" | "archived" | "review";

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
  const { toast } = useToast();

  const [reactivatingIds, setReactivatingIds] = useState<Set<string>>(new Set());
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [archivingIds, setArchivingIds] = useState<Set<string>>(new Set());
  const [confirmCancelTicket, setConfirmCancelTicket] = useState<TicketData | null>(null);

  const [editingTicket, setEditingTicket] = useState<TicketData | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editEventId, setEditEventId] = useState("");

  const { data: ticketList } = useQuery<TicketData[]>({ queryKey: ["/api/tickets"] });
  const { data: eventList } = useQuery<EventData[]>({ queryKey: ["/api/events"], queryFn: () =>
    apiRequest("GET", "/api/events?includeArchived=true").then(r => r.json())
  });

  function openEditModal(ticket: TicketData) {
    setEditingTicket(ticket);
    setEditName(ticket.purchaserName);
    setEditEmail(ticket.purchaserEmail);
    setEditEventId(ticket.eventId);
  }

  function closeEditModal() {
    setEditingTicket(null);
    setEditName("");
    setEditEmail("");
    setEditEventId("");
  }

  const editMutation = useMutation({
    mutationFn: async ({ ticketId, resend }: { ticketId: string; resend: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/tickets/${ticketId}`, {
        purchaserName: editName.trim(),
        purchaserEmail: editEmail.trim(),
        eventId: editEventId,
        resend,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to update ticket");
      }
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      closeEditModal();
      toast({
        title: "Ticket updated",
        description: vars.resend
          ? "Ticket saved and reissue email sent."
          : "Ticket information has been updated.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Error updating ticket", description: err.message, variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      setReactivatingIds(prev => new Set(prev).add(ticketId));
      const res = await apiRequest("POST", `/api/admin/tickets/${ticketId}/reactivate`);
      return res.json();
    },
    onSuccess: (_data, ticketId) => {
      setReactivatingIds(prev => { const s = new Set(prev); s.delete(ticketId); return s; });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket reactivated", description: "The ticket has been moved back to active." });
    },
    onError: (_err, ticketId) => {
      setReactivatingIds(prev => { const s = new Set(prev); s.delete(ticketId); return s; });
      toast({ title: "Failed to reactivate", description: "Could not reactivate the ticket.", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      setCancellingIds(prev => new Set(prev).add(ticketId));
      const res = await apiRequest("POST", `/api/admin/tickets/${ticketId}/cancel`);
      return res.json();
    },
    onSuccess: (_data, ticketId) => {
      setCancellingIds(prev => { const s = new Set(prev); s.delete(ticketId); return s; });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      toast({ title: "Ticket cancelled", description: "The ticket has been cancelled." });
    },
    onError: (_err, ticketId) => {
      setCancellingIds(prev => { const s = new Set(prev); s.delete(ticketId); return s; });
      toast({ title: "Failed to cancel", description: "Could not cancel the ticket.", variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      setArchivingIds(prev => new Set(prev).add(ticketId));
      const res = await apiRequest("POST", `/api/admin/tickets/${ticketId}/archive`);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to archive ticket");
      }
      return res.json();
    },
    onSuccess: (_data, ticketId) => {
      setArchivingIds(prev => { const s = new Set(prev); s.delete(ticketId); return s; });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      closeEditModal();
      toast({ title: "Ticket archived", description: "The ticket has been moved to the archive." });
    },
    onError: (err: any, ticketId) => {
      setArchivingIds(prev => { const s = new Set(prev); s.delete(ticketId); return s; });
      toast({ title: "Failed to archive", description: err.message, variant: "destructive" });
    },
  });

  const upcomingTickets = useMemo(() => (ticketList || []).filter(t => !t.archived), [ticketList]);
  const archivedTickets = useMemo(() => (ticketList || []).filter(t => t.archived), [ticketList]);

  const upcomingStats = useMemo(() => {
    const valid = upcomingTickets.filter(t => t.status === "valid").length;
    const used = upcomingTickets.filter(t => t.status === "used").length;
    const cancelled = upcomingTickets.filter(t => t.status === "cancelled").length;
    const courtesy = upcomingTickets.filter(t => !t.stripeSessionId).length;
    const pendingReview = upcomingTickets.filter(t => t.status === "pending_review").length;
    return { valid, used, cancelled, courtesy, pendingReview };
  }, [upcomingTickets]);

  const filtered = useMemo(() => {
    const source = activeFilter === "archived" ? archivedTickets : upcomingTickets;
    return source.filter((t) => {
      const matchesFilter =
        activeFilter === "all" || activeFilter === "archived" ||
        (activeFilter === "review" ? t.status === "pending_review" :
         activeFilter === "courtesy" ? !t.stripeSessionId : t.status === activeFilter);
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

  const filterTabs: { key: FilterTab; label: string; count: number; icon?: typeof Archive; accent?: string }[] = [
    { key: "all", label: "All", count: upcomingTickets.length },
    { key: "valid", label: "Valid", count: upcomingStats.valid },
    { key: "used", label: "Used", count: upcomingStats.used },
    { key: "courtesy", label: "Courtesy", count: upcomingStats.courtesy },
    { key: "cancelled", label: "Cancelled", count: upcomingStats.cancelled },
    { key: "review", label: "Pending Review", count: upcomingStats.pendingReview, icon: AlertTriangle, accent: "amber" },
    { key: "archived", label: "Archived", count: archivedTickets.length, icon: Archive },
  ];

  const editFormValid = editName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail.trim()) && editEventId;

  const sortedEvents = useMemo(() => {
    if (!eventList) return [];
    return [...eventList].sort((a, b) => {
      const da = a.calendarDate ? new Date(a.calendarDate).getTime() : 0;
      const db = b.calendarDate ? new Date(b.calendarDate).getTime() : 0;
      return db - da;
    });
  }, [eventList]);

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
                      ? tab.accent === "amber"
                        ? "bg-amber-500 text-white shadow-soft"
                        : "bg-primary text-primary-foreground shadow-soft"
                      : tab.accent === "amber"
                        ? "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                  }`}
                  data-testid={`filter-${tab.key}`}
                >
                  {tab.icon && <tab.icon className="h-3 w-3" />}
                  {tab.label}
                  <span className={`text-[10px] px-1 py-0.5 rounded-md ${
                    activeFilter === tab.key
                      ? tab.accent === "amber" ? "bg-white/20" : "bg-primary-foreground/20"
                      : tab.accent === "amber" ? "bg-amber-200/60 dark:bg-amber-800/40" : "bg-muted"
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
                  {search ? "No matching tickets" : activeFilter === "archived" ? "No archived tickets" : activeFilter === "review" ? "No tickets pending review" : "No tickets in this category"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-card-border">
                {filtered.map((ticket) => {
                  const isPending = ticket.status === "pending_review";
                  return (
                    <div
                      key={ticket.id}
                      className={`flex items-center gap-3 px-4 md:px-6 py-3 transition-colors ${
                        isPending
                          ? "bg-[#FFF9C4] dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                          : ticket.archived
                          ? "opacity-60 hover:bg-muted/30"
                          : "hover:bg-muted/30"
                      }`}
                      data-testid={`ticket-${ticket.id}`}
                    >
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                        isPending
                          ? "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                          : ticket.status === "valid"
                          ? "bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400"
                          : ticket.status === "used"
                          ? "bg-yellow-50 text-yellow-600 dark:bg-yellow-950/30 dark:text-yellow-400"
                          : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                      }`}>
                        {isPending
                          ? <AlertTriangle className="h-4 w-4" />
                          : ticket.status === "valid" ? <CheckCircle2 className="h-4 w-4" />
                          : ticket.status === "used" ? <Circle className="h-4 w-4" />
                          : <XCircle className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEditModal(ticket)}
                            className="text-sm font-medium truncate hover:text-primary transition-colors text-left"
                            data-testid={`button-edit-${ticket.id}`}
                            title="Edit ticket"
                          >
                            {ticket.purchaserName}
                          </button>
                          <Pencil className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                          {isPending && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-amber-200 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300">
                              Pending Review
                            </span>
                          )}
                          {!ticket.stripeSessionId && !isPending && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-primary/10 text-primary">Courtesy</span>
                          )}
                          {!ticket.stripeSessionId && ticket.issuedBy && !isPending && (
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
                      {activeFilter === "archived" && (
                        <button
                          onClick={() => reactivateMutation.mutate(ticket.id)}
                          disabled={reactivatingIds.has(ticket.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Reactivate ticket"
                          data-testid={`button-reactivate-${ticket.id}`}
                        >
                          {reactivatingIds.has(ticket.id)
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <RotateCcw className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {ticket.status !== "cancelled" && ticket.status !== "used" && (
                        <button
                          onClick={() => setConfirmCancelTicket(ticket)}
                          disabled={cancellingIds.has(ticket.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Cancel ticket"
                          data-testid={`button-cancel-${ticket.id}`}
                        >
                          {cancellingIds.has(ticket.id)
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin text-red-500" />
                            : <img src={deleteTicketIcon} alt="Cancel" className="h-4 w-4" />}
                        </button>
                      )}
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
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmCancelTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setConfirmCancelTicket(null)}
          data-testid="modal-cancel-confirm"
        >
          <div
            className="bg-card border border-card-border rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/30 flex-shrink-0">
                <img src={deleteTicketIcon} alt="Cancel" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Cancel ticket?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">This action is irreversible.</p>
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 border border-card-border px-4 py-3 space-y-1">
              <p className="text-sm font-medium">{confirmCancelTicket.purchaserName}</p>
              <p className="text-xs text-muted-foreground">{confirmCancelTicket.purchaserEmail}</p>
              <p className="text-xs text-muted-foreground">{confirmCancelTicket.ticketType}</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmCancelTicket(null)}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-muted/50 hover:bg-muted/70 transition-colors"
                data-testid="button-cancel-dismiss"
              >
                Keep ticket
              </button>
              <button
                onClick={() => {
                  cancelMutation.mutate(confirmCancelTicket.id);
                  setConfirmCancelTicket(null);
                }}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                data-testid="button-cancel-confirm"
              >
                Cancel ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={closeEditModal}
          data-testid="modal-edit-ticket"
        >
          <div
            className="bg-card border border-card-border rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${
                editingTicket.status === "pending_review"
                  ? "bg-amber-100 dark:bg-amber-950/40"
                  : "bg-primary/10"
              }`}>
                {editingTicket.status === "pending_review"
                  ? <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  : <Pencil className="h-5 w-5 text-primary" />}
              </div>
              <div>
                <h3 className="text-sm font-semibold">Edit Ticket</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editingTicket.status === "pending_review"
                    ? "This ticket is pending admin review — fix the fields or archive it."
                    : "Update name, email, or assigned event."}
                </p>
              </div>
            </div>

            {editingTicket.status === "pending_review" && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700/50 px-3 py-2.5 flex gap-2 items-start">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  This ticket has not been sent to the customer yet. Fix the missing fields (date, street address, or name) and use <strong>Save & Send</strong> to deliver it, or click <strong>Archive Ticket</strong> to dismiss it.
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                  placeholder="Full name"
                  data-testid="input-edit-name"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                  placeholder="email@example.com"
                  data-testid="input-edit-email"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Event</label>
                <select
                  value={editEventId}
                  onChange={(e) => setEditEventId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none bg-muted/40 border border-card-border focus:ring-2 focus:ring-primary/30"
                  data-testid="select-edit-event"
                >
                  <option value="">Select event...</option>
                  {sortedEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}{ev.date ? ` · ${ev.date}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {editingTicket.status !== "pending_review" && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2.5 flex gap-2 items-start">
                <span className="text-amber-500 text-sm mt-0.5">ℹ️</span>
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  The QR code will remain the same — only the displayed information changes. Use <strong>Save & Resend</strong> to send an updated email with the new ticket details.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <div className="flex gap-2">
                <button
                  onClick={closeEditModal}
                  disabled={editMutation.isPending || archiveMutation.isPending}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-muted/50 hover:bg-muted/70 transition-colors disabled:opacity-50"
                  data-testid="button-edit-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={() => editMutation.mutate({ ticketId: editingTicket.id, resend: false })}
                  disabled={!editFormValid || editMutation.isPending || archiveMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-edit-save"
                >
                  {editMutation.isPending && !editMutation.variables?.resend
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : null}
                  Save
                </button>
                <button
                  onClick={() => editMutation.mutate({ ticketId: editingTicket.id, resend: true })}
                  disabled={!editFormValid || editMutation.isPending || archiveMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-[#94a779] text-white hover:bg-[#7a8f63] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-edit-save-resend"
                >
                  {editMutation.isPending && editMutation.variables?.resend
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Mail className="h-3.5 w-3.5" />}
                  {editingTicket.status === "pending_review" ? "Save & Send" : "Save & Resend"}
                </button>
              </div>
              <button
                onClick={() => archiveMutation.mutate(editingTicket.id)}
                disabled={editMutation.isPending || archiveMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border border-card-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="button-archive-ticket"
              >
                {archiveMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Archive className="h-3.5 w-3.5" />}
                Archive Ticket
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
