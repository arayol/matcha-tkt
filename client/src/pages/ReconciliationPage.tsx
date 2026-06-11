import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  GitCompareArrows, AlertTriangle, CheckCircle2, XCircle,
  Download, Filter, Edit2, Check, X, Loader2, Calendar, Plus, Trash2, Send, MailCheck,
  Upload, FileUp, FileSpreadsheet, RotateCcw, Scissors, Clock, ChevronDown,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { EventDateName, CsvUpload } from "@shared/schema";

interface Divergence {
  id: string;
  type: "missing_in_stripe" | "missing_in_csv" | "data_mismatch";
  source: "csv" | "stripe" | "both";
  orderNumber: string | null;
  email: string | null;
  billingName: string | null;
  csvPrice: string | null;
  csvProduct: string | null;
  csvTicketType: string | null;
  orderType: string;
  eventDate: string | null;
  stripeData: {
    ticketId: string;
    name: string;
    email: string;
    ticketType: string;
    eventName: string | null;
    priceInCents: number | null;
  } | null;
  differences?: string[];
}

interface ReconciliationData {
  divergences: Divergence[];
  summary: {
    totalCsvRecords: number;
    totalStripeTickets: number;
    totalDivergences: number;
    missingInStripe: number;
    missingInCsv: number;
    dataMismatches: number;
    reconciled: number;
  };
}

interface ReconciliationPageProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

function DivergenceTypeBadge({ type }: { type: string }) {
  if (type === "missing_in_stripe") {
    return <Badge variant="destructive" data-testid={`badge-type-${type}`}><XCircle className="h-3 w-3 mr-1" />Missing in Stripe</Badge>;
  }
  if (type === "missing_in_csv") {
    return <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400" data-testid={`badge-type-${type}`}><AlertTriangle className="h-3 w-3 mr-1" />Missing in CSV</Badge>;
  }
  return <Badge variant="secondary" data-testid={`badge-type-${type}`}><GitCompareArrows className="h-3 w-3 mr-1" />Data Mismatch</Badge>;
}

function SourceBadge({ source }: { source: string }) {
  if (source === "csv") return <Badge variant="outline" data-testid={`badge-source-${source}`}>CSV</Badge>;
  if (source === "stripe") return <Badge variant="outline" data-testid={`badge-source-${source}`}>Stripe</Badge>;
  return <Badge variant="outline" data-testid={`badge-source-${source}`}>Both</Badge>;
}

export default function ReconciliationPage({ dark, toggleTheme, onLogout, user }: ReconciliationPageProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>("all");
  const [filterOrderType, setFilterOrderType] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ billingName: "", email: "", price: "", parsedTicketType: "" });
  const [showTicketDialog, setShowTicketDialog] = useState(false);
  const [showEditEventDialog, setShowEditEventDialog] = useState(false);
  const [editEventTarget, setEditEventTarget] = useState<any>(null);
  const [editEventForm, setEditEventForm] = useState({ name: "", date: "", time: "", eventType: "", location: "", capacity: "", locationStreet: "", locationCity: "", locationZip: "" });
  const [ticketDialogIds, setTicketDialogIds] = useState<string[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>("");
  const [confirmDeleteEventId, setConfirmDeleteEventId] = useState<string | null>(null);
  const [showFixTimesDialog, setShowFixTimesDialog] = useState(false);
  const [showAddEventDialog, setShowAddEventDialog] = useState(false);
  const [addEventForm, setAddEventForm] = useState({ name: "", date: "", time: "", eventType: "", location: "", capacity: "", locationStreet: "", locationCity: "", locationZip: "" });
  const [eventsCollapsed, setEventsCollapsed] = useState(true);
  const [eventsTab, setEventsTab] = useState<"upcoming" | "archived">("upcoming");

  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitSourceEventId, setSplitSourceEventId] = useState<string | null>(null);
  const [splitSelectedTickets, setSplitSelectedTickets] = useState<Set<string>>(new Set());
  const [splitTargetEventId, setSplitTargetEventId] = useState<string>("");
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ orderNumber: string; email: string; billingName: string; phone: string; product: string; price: string; subtotal: string; discountCode: string; quantity: string; status: string }[]>([]);
  const [csvResult, setCsvResult] = useState<any>(null);
  const [csvDragOver, setCsvDragOver] = useState(false);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<ReconciliationData>({
    queryKey: ["/api/admin/reconciliation"],
  });

  const { data: eventDateNames } = useQuery<EventDateName[]>({
    queryKey: ["/api/admin/event-date-names"],
  });

  const { data: csvOrders } = useQuery<any[]>({
    queryKey: ["/api/admin/csv/orders"],
  });

  const { data: eventsData } = useQuery<any[]>({
    queryKey: ["/api/events?includeArchived=true"],
    queryFn: () => apiRequest("GET", "/api/events?includeArchived=true").then(r => r.json()),
  });

  const { data: splitTicketsData } = useQuery<{ id: string; billingName: string; email: string; ticketType: string; ticketTime: string | null }[]>({
    queryKey: ["/api/admin/events", splitSourceEventId, "tickets"],
    enabled: !!splitSourceEventId && showSplitDialog,
  });

  const eventsToday = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const upcomingEvents = useMemo(() => (eventsData || []).filter((ev: any) => !ev.calendarDate || new Date(ev.calendarDate) >= eventsToday), [eventsData, eventsToday]);
  const archivedEvents = useMemo(() => (eventsData || []).filter((ev: any) => ev.calendarDate && new Date(ev.calendarDate) < eventsToday), [eventsData, eventsToday]);
  const displayedEvents = eventsTab === "upcoming" ? upcomingEvents : archivedEvents;

  const applyMutation = useMutation({
    mutationFn: (body: { action: string; ids: string[] }) =>
      apiRequest("POST", "/api/admin/reconciliation/apply", body),
    onSuccess: async (res) => {
      const result = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/events/comparison"] });
      setSelectedIds(new Set());
      toast({ title: `${result.processed} records processed` });
    },
    onError: () => toast({ title: "Failed to apply action", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, string> }) =>
      apiRequest("PATCH", `/api/admin/reconciliation/${id}`, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/events/comparison"] });
      setEditingId(null);
      toast({ title: "Record updated" });
    },
    onError: () => toast({ title: "Failed to update record", variant: "destructive" }),
  });

  const saveEditEventMutation = useMutation({
    mutationFn: async ({ id, eventData, ednData }: { id: string; eventData: Record<string, any>; ednData: { eventDate: string; eventName: string; locationStreet?: string; locationCity?: string; locationZip?: string } }) => {
      await apiRequest("PATCH", `/api/admin/events/${id}`, eventData);
      await apiRequest("POST", "/api/admin/event-date-names", ednData);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/event-date-names"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      setShowEditEventDialog(false);
      setEditEventTarget(null);
      toast({ title: "Event updated" });
    },
    onError: () => toast({ title: "Failed to update event", variant: "destructive" }),
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/events/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setConfirmDeleteEventId(null);
      toast({ title: "Event deleted" });
    },
    onError: () => toast({ title: "Failed to delete event", variant: "destructive" }),
  });

  const syncEventsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/events/sync-from-dates", {}).then(r => r.json()),
    onSuccess: async (result: { created: string[]; skipped: string[] }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      const msg = result.created.length > 0
        ? `Created: ${result.created.join(", ")}`
        : "All events already exist";
      toast({ title: "Sync complete", description: msg });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const createEventMutation = useMutation({
    mutationFn: async (body: { name: string; date: string; time: string; eventType: string; location: string; capacity: string; locationStreet: string; locationCity: string; locationZip: string }) => {
      await apiRequest("POST", "/api/admin/events", {
        name: body.name, date: body.date, time: body.time, eventType: body.eventType,
        location: body.location, capacity: body.capacity,
      });
      if (body.locationStreet || body.locationCity || body.locationZip) {
        await apiRequest("POST", "/api/admin/event-date-names", {
          eventDate: body.date,
          eventName: body.name,
          locationStreet: body.locationStreet || undefined,
          locationCity: body.locationCity || undefined,
          locationZip: body.locationZip || undefined,
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/event-date-names"] });
      setShowAddEventDialog(false);
      setAddEventForm({ name: "", date: "", time: "", eventType: "", location: "", capacity: "", locationStreet: "", locationCity: "", locationZip: "" });
      toast({ title: "Event created" });
    },
    onError: (err: any) => toast({ title: "Failed to create event", description: err?.message, variant: "destructive" }),
  });

  const fixTimesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/migrate/event-model", {}).then(r => r.json()),
    onSuccess: async (result: { ok: boolean; log: string[] }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      setShowFixTimesDialog(false);
      toast({ title: "Fix Times complete", description: result.log.join("; ") });
    },
    onError: () => { toast({ title: "Fix Times failed", variant: "destructive" }); },
  });

  const moveTicketsMutation = useMutation({
    mutationFn: (body: { ticketIds: string[]; targetEventId: string }) =>
      apiRequest("POST", "/api/admin/tickets/move", body).then(r => r.json()),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      setShowSplitDialog(false);
      setSplitSourceEventId(null);
      setSplitSelectedTickets(new Set());
      setSplitTargetEventId("");
      toast({ title: "Tickets moved successfully" });
    },
    onError: () => toast({ title: "Failed to move tickets", variant: "destructive" }),
  });

  const mergeEventsMutation = useMutation({
    mutationFn: ({ keepId, mergeIds }: { keepId: string; mergeIds: string[] }) =>
      apiRequest("POST", "/api/admin/events/merge", { keepId, mergeIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setShowMergeDialog(false);
      setMergeSourceId(null);
      setMergeTargetId("");
      toast({ title: "Tickets moved and event deleted" });
    },
    onError: () => toast({ title: "Failed to merge events", variant: "destructive" }),
  });

  const generateTicketsMutation = useMutation({
    mutationFn: (ids: string[]) =>
      apiRequest("POST", "/api/admin/reconciliation/generate-tickets", { ids }).then(r => r.json()),
    onSuccess: async (result: { sent: number; skipped: number; errors: number; results: any[] }) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/events/comparison"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/orders"] });
      setSelectedIds(new Set());
      setShowTicketDialog(false);
      setTicketDialogIds([]);
      toast({
        title: "Tickets generated",
        description: `${result.sent} sent, ${result.skipped} skipped${result.errors > 0 ? `, ${result.errors} errors` : ""}`,
      });
    },
    onError: () => {
      toast({ title: "Failed to generate tickets", variant: "destructive" });
    },
  });

  const divergences = data?.divergences || [];
  const summary = data?.summary;

  const filtered = divergences.filter((d) => {
    if (filterType !== "all" && d.type !== filterType) return false;
    if (filterOrderType !== "all" && d.orderType !== filterOrderType) return false;
    return true;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((d) => d.id)));
    }
  };

  const handleExport = () => {
    window.open("/api/admin/reconciliation/export", "_blank");
  };

  const startEdit = (d: Divergence) => {
    setEditingId(d.id);
    setEditForm({
      billingName: d.billingName || "",
      email: d.email || "",
      price: d.csvPrice || "",
      parsedTicketType: d.csvTicketType || "",
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    editMutation.mutate({ id: editingId, data: editForm });
  };

  const { data: csvUploads, isLoading: csvUploadsLoading } = useQuery<CsvUpload[]>({
    queryKey: ["/api/admin/csv/uploads"],
  });

  const csvUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/csv/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCsvResult(data);
      setCsvFile(null);
      setCsvPreview([]);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      toast({
        title: "CSV imported successfully",
        description: `${data.imported} records imported${data.skipped > 0 ? `, ${data.skipped} duplicates skipped` : ""}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const csvRevertMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/csv/uploads/${id}/revert`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reconciliation"] });
      toast({ title: "Upload reverted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to revert upload", variant: "destructive" });
    },
  });

  const parseCsvPreview = useCallback((text: string) => {
    const parseCsvLine = (line: string): string[] => {
      const fields: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else { inQuotes = false; }
          } else { current += ch; }
        } else {
          if (ch === '"') { inQuotes = true; } else if (ch === ',') { fields.push(current.trim()); current = ""; } else { current += ch; }
        }
      }
      fields.push(current.trim());
      return fields;
    };
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]);
    const findCol = (names: string[]) => {
      for (const name of names) { const idx = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase()); if (idx !== -1) return idx; }
      for (const name of names) { const idx = headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase())); if (idx !== -1) return idx; }
      return -1;
    };
    const orderCol = findCol(["Order Number", "Order #", "Order"]);
    const emailCol = findCol(["Email", "Billing Email"]);
    const nameCol = findCol(["Billing Name", "Customer Name", "Name"]);
    const phoneCol = findCol(["Billing Phone", "Phone"]);
    const productCol = findCol(["Product Names", "Product Name", "Product"]);
    const priceCol = findCol(["Price", "Unit Price"]);
    const subtotalCol = findCol(["Subtotal", "Total", "Amount"]);
    const discountCol = findCol(["Discount Amount", "Discount Code", "Discount", "Coupon"]);
    const qtyCol = findCol(["Quantity", "Qty"]);
    const statusCol = findCol(["Status", "Order Status"]);
    const rows: typeof csvPreview = [];
    const maxPreview = Math.min(lines.length, 21);
    for (let i = 1; i < maxPreview; i++) {
      const cols = parseCsvLine(lines[i]);
      rows.push({
        orderNumber: orderCol >= 0 ? cols[orderCol] || "" : "",
        email: emailCol >= 0 ? cols[emailCol] || "" : "",
        billingName: nameCol >= 0 ? cols[nameCol] || "" : "",
        phone: phoneCol >= 0 ? cols[phoneCol] || "" : "",
        product: productCol >= 0 ? cols[productCol] || "" : "",
        price: priceCol >= 0 ? cols[priceCol] || "" : "",
        subtotal: subtotalCol >= 0 ? cols[subtotalCol] || "" : "",
        discountCode: discountCol >= 0 ? cols[discountCol] || "" : "",
        quantity: qtyCol >= 0 ? cols[qtyCol] || "" : "",
        status: statusCol >= 0 ? cols[statusCol] || "" : "",
      });
    }
    return rows;
  }, []);

  const handleCsvFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Please select a CSV file", variant: "destructive" });
      return;
    }
    setCsvFile(file);
    setCsvResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvPreview(parseCsvPreview(text));
    };
    reader.readAsText(file);
  }, [parseCsvPreview, toast]);

  const handleCsvDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleCsvFile(file);
  }, [handleCsvFile]);

  return (
    <AppLayout dark={dark} toggleTheme={toggleTheme} onLogout={onLogout} user={user} activePath="/admin/reconciliation" data-testid="reconciliation-page">
      <div className="space-y-6">
        <div className="hidden md:flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">Event Management</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowCsvImport(true)} variant="outline" data-testid="button-import-csv">
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button onClick={handleExport} variant="outline" data-testid="button-export">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="summary-panel">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">CSV Records</p>
                  <p className="text-2xl font-semibold mt-1" data-testid="text-total-csv">{summary.totalCsvRecords}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Reconciled</p>
                  <p className="text-2xl font-semibold mt-1 text-green-600 dark:text-green-400" data-testid="text-reconciled">{summary.reconciled}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Divergences</p>
                  <p className="text-2xl font-semibold mt-1 text-amber-600 dark:text-amber-400" data-testid="text-divergences">{summary.totalDivergences}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">Stripe Tickets</p>
                  <p className="text-2xl font-semibold mt-1" data-testid="text-total-stripe">{summary.totalStripeTickets}</p>
                </Card>
              </div>
            )}

            {summary && summary.totalDivergences > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="summary-breakdown">
                <Badge variant="destructive" className="no-default-active-elevate">
                  <XCircle className="h-3 w-3 mr-1" />{summary.missingInStripe} missing in Stripe
                </Badge>
                <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400 no-default-active-elevate">
                  <AlertTriangle className="h-3 w-3 mr-1" />{summary.missingInCsv} missing in CSV
                </Badge>
                <Badge variant="secondary" className="no-default-active-elevate">
                  <GitCompareArrows className="h-3 w-3 mr-1" />{summary.dataMismatches} mismatches
                </Badge>
              </div>
            )}

            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
                    <SelectValue placeholder="Divergence type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="missing_in_stripe">Missing in Stripe</SelectItem>
                    <SelectItem value="missing_in_csv">Missing in CSV</SelectItem>
                    <SelectItem value="data_mismatch">Data Mismatch</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterOrderType} onValueChange={setFilterOrderType}>
                  <SelectTrigger className="w-[160px]" data-testid="select-filter-order-type">
                    <SelectValue placeholder="Order type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Orders</SelectItem>
                    <SelectItem value="ticket">Tickets</SelectItem>
                    <SelectItem value="vendor">Vendors</SelectItem>
                    <SelectItem value="expositor">Expositors</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {eventsData && (
              <Card data-testid="card-events">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-3 flex-wrap">
                      <CardTitle
                        className="text-base font-medium flex items-center gap-2 cursor-pointer select-none"
                        onClick={() => setEventsCollapsed(v => !v)}
                      >
                        <Calendar className="h-4 w-4" />
                        Events
                      </CardTitle>
                      {/* Tab switcher */}
                      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEventsCollapsed(false); setEventsTab("upcoming"); }}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            eventsTab === "upcoming" && !eventsCollapsed
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          }`}
                          data-testid="tab-events-upcoming"
                        >
                          Upcoming
                          <span className={`text-[10px] px-1 py-0.5 rounded ${eventsTab === "upcoming" && !eventsCollapsed ? "bg-white/20" : "bg-muted"}`}>
                            {upcomingEvents.length}
                          </span>
                        </button>
                        <button
                          onClick={() => { setEventsCollapsed(false); setEventsTab("archived"); }}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            eventsTab === "archived" && !eventsCollapsed
                              ? "bg-muted-foreground/80 text-background"
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          }`}
                          data-testid="tab-events-archived"
                        >
                          Archived
                          <span className={`text-[10px] px-1 py-0.5 rounded ${eventsTab === "archived" && !eventsCollapsed ? "bg-white/20" : "bg-muted"}`}>
                            {archivedEvents.length}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowAddEventDialog(true)}
                          data-testid="button-add-event"
                          title="Add a new event manually"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Add Event
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setShowFixTimesDialog(true)}
                          data-testid="button-fix-times"
                          title="Backfill class times on tickets"
                        >
                          <Clock className="h-3.5 w-3.5 mr-1" />
                          Fix Times
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => syncEventsMutation.mutate()}
                          disabled={syncEventsMutation.isPending}
                          data-testid="button-sync-events"
                          title="Create missing events from Event Names by Date"
                        >
                          {syncEventsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                          Sync
                        </Button>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${eventsCollapsed ? "" : "rotate-180"}`} />
                    </div>
                  </div>
                </CardHeader>
                {!eventsCollapsed && (<CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground">Date</th>
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground">Name</th>
                        <th className="text-left p-3 font-medium text-xs text-muted-foreground">Location</th>
                        <th className="text-center p-3 font-medium text-xs text-muted-foreground w-16">Tickets</th>
                        <th className="text-right p-3 font-medium text-xs text-muted-foreground w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {displayedEvents.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                            {eventsTab === "upcoming" ? "No upcoming events." : "No archived events."}
                          </td>
                        </tr>
                      )}
                      {displayedEvents.map((ev: any) => {
                        const edn = eventDateNames?.find((e: any) => e.eventDate === ev.date);
                        const locationDisplay = edn ? [edn.locationStreet, edn.locationCity, edn.locationZip].filter(Boolean).join(", ") : null;
                        return (
                        <tr key={ev.id} data-testid={`event-row-${ev.id}`}>
                          {confirmDeleteEventId === ev.id ? (
                            <td colSpan={5} className="p-3">
                              <div className="flex items-center gap-3 text-sm">
                                <span className="text-destructive font-medium">Delete "{ev.name}"? This cannot be undone.</span>
                                <div className="flex gap-2 ml-auto">
                                  <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteEventId(null)}>Cancel</Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => deleteEventMutation.mutate(ev.id)}
                                    disabled={deleteEventMutation.isPending}
                                    data-testid={`button-confirm-delete-event-${ev.id}`}
                                  >
                                    {deleteEventMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="p-3">
                                <Badge variant="outline" className="font-mono text-xs" data-testid={`text-event-date-${ev.id}`}>{ev.date}</Badge>
                              </td>
                              <td className="p-3 font-medium text-sm" data-testid={`text-event-name-${ev.id}`}>{ev.name}</td>
                              <td className="p-3 text-xs text-muted-foreground" data-testid={`text-event-location-${ev.id}`}>
                                {locationDisplay ? (
                                  <span>📍 {locationDisplay}</span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant={ev.ticketCount > 0 ? "secondary" : "outline"} className="text-xs" data-testid={`text-event-tickets-${ev.id}`}>
                                  {ev.ticketCount}
                                </Badge>
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    title="Edit event"
                                    onClick={() => {
                                      setEditEventTarget(ev);
                                      setEditEventForm({
                                        name: ev.name || "",
                                        date: ev.date || "",
                                        time: ev.time || "",
                                        eventType: ev.eventType || "",
                                        location: ev.location || "",
                                        capacity: ev.capacity != null ? String(ev.capacity) : "",
                                        locationStreet: edn?.locationStreet || "",
                                        locationCity: edn?.locationCity || "",
                                        locationZip: edn?.locationZip || "",
                                      });
                                      setShowEditEventDialog(true);
                                    }}
                                    data-testid={`button-edit-event-${ev.id}`}
                                  >
                                    <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  </Button>
                                  {ev.ticketCount > 0 ? (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        title="Split — move selected tickets to another event"
                                        onClick={() => {
                                          setSplitSourceEventId(ev.id);
                                          setSplitSelectedTickets(new Set());
                                          setSplitTargetEventId("");
                                          setShowSplitDialog(true);
                                        }}
                                        data-testid={`button-split-event-${ev.id}`}
                                      >
                                        <Scissors className="h-3.5 w-3.5 text-muted-foreground" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        title="Merge — move ALL tickets to another event"
                                        onClick={() => { setMergeSourceId(ev.id); setMergeTargetId(""); setShowMergeDialog(true); }}
                                        data-testid={`button-merge-event-${ev.id}`}
                                      >
                                        <GitCompareArrows className="h-3.5 w-3.5 text-muted-foreground" />
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      title="Delete event"
                                      onClick={() => setConfirmDeleteEventId(ev.id)}
                                      data-testid={`button-delete-event-${ev.id}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>)}
              </Card>
            )}

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground" data-testid="text-selected-count">
                  {selectedIds.size} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const ids = Array.from(selectedIds);
                    const selected = divergences.filter(d => ids.includes(d.id));
                    const csvOnly = selected.filter(d => d.type === "missing_in_stripe" && d.source === "csv");
                    if (csvOnly.length > 0) {
                      setTicketDialogIds(ids);
                      setShowTicketDialog(true);
                    } else {
                      applyMutation.mutate({ action: "reconcile", ids });
                    }
                  }}
                  disabled={applyMutation.isPending}
                  data-testid="button-bulk-reconcile"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Mark Reconciled
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => applyMutation.mutate({ action: "delete", ids: Array.from(selectedIds) })}
                  disabled={applyMutation.isPending}
                  data-testid="button-bulk-delete"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            )}

            <Card className="overflow-visible">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="p-3 w-10">
                        <Checkbox
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Order #</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Ticket Type</th>
                      <th className="p-3">Event Date</th>
                      <th className="p-3">Differences</th>
                      <th className="p-3 w-16">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-muted-foreground">
                          <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p data-testid="text-no-divergences">No divergences found</p>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((d) => (
                        <tr key={d.id} className="border-b last:border-b-0" data-testid={`row-divergence-${d.id}`}>
                          <td className="p-3">
                            <Checkbox
                              checked={selectedIds.has(d.id)}
                              onCheckedChange={() => toggleSelect(d.id)}
                              data-testid={`checkbox-select-${d.id}`}
                            />
                          </td>
                          <td className="p-3"><DivergenceTypeBadge type={d.type} /></td>
                          <td className="p-3"><SourceBadge source={d.source} /></td>
                          <td className="p-3 font-mono text-xs" data-testid={`text-order-${d.id}`}>{d.orderNumber || "-"}</td>
                          <td className="p-3">
                            {editingId === d.id ? (
                              <Input
                                value={editForm.email}
                                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                                className="h-8 text-xs"
                                data-testid={`input-edit-email-${d.id}`}
                              />
                            ) : (
                              <span className="text-xs" data-testid={`text-email-${d.id}`}>{d.email || "-"}</span>
                            )}
                          </td>
                          <td className="p-3">
                            {editingId === d.id ? (
                              <Input
                                value={editForm.billingName}
                                onChange={(e) => setEditForm((f) => ({ ...f, billingName: e.target.value }))}
                                className="h-8 text-xs"
                                data-testid={`input-edit-name-${d.id}`}
                              />
                            ) : (
                              <div>
                                <span className="text-xs" data-testid={`text-name-${d.id}`}>{d.billingName || "-"}</span>
                                {d.stripeData?.name && d.billingName && d.billingName.toLowerCase() !== d.stripeData.name.toLowerCase() && (
                                  <span className="block text-xs text-muted-foreground">Stripe: {d.stripeData.name}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            {editingId === d.id ? (
                              <Input
                                value={editForm.price}
                                onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                                className="h-8 text-xs"
                                data-testid={`input-edit-price-${d.id}`}
                              />
                            ) : (
                              <div>
                                <span className="text-xs" data-testid={`text-price-${d.id}`}>{d.csvPrice || "-"}</span>
                                {d.stripeData?.priceInCents != null && (
                                  <span className="block text-xs text-muted-foreground">
                                    Stripe: ${(d.stripeData.priceInCents / 100).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            {editingId === d.id ? (
                              <Input
                                value={editForm.parsedTicketType}
                                onChange={(e) => setEditForm((f) => ({ ...f, parsedTicketType: e.target.value }))}
                                className="h-8 text-xs"
                                data-testid={`input-edit-ticket-type-${d.id}`}
                              />
                            ) : (
                              <span className="text-xs" data-testid={`text-ticket-type-${d.id}`}>{d.csvTicketType || d.stripeData?.ticketType || "-"}</span>
                            )}
                          </td>
                          <td className="p-3 text-xs" data-testid={`text-date-${d.id}`}>{d.eventDate || "-"}</td>
                          <td className="p-3">
                            {d.differences && d.differences.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {d.differences.map((diff) => (
                                  <Badge key={diff} variant="outline" className="text-xs">
                                    {diff}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            {d.source === "csv" || d.source === "both" ? (
                              editingId === d.id ? (
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" onClick={saveEdit} disabled={editMutation.isPending} data-testid={`button-save-${d.id}`}>
                                    <Check className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} data-testid={`button-cancel-${d.id}`}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <Button size="icon" variant="ghost" onClick={() => startEdit(d)} data-testid={`button-edit-${d.id}`}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="md:hidden pb-4 space-y-2">
              <Button onClick={() => setShowCsvImport(true)} variant="outline" className="w-full" data-testid="button-import-csv-mobile">
                <Upload className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
              <Button onClick={handleExport} variant="outline" className="w-full" data-testid="button-export-mobile">
                <Download className="h-4 w-4 mr-2" />
                Export Divergences CSV
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={showTicketDialog} onOpenChange={(open) => { if (!open) { setShowTicketDialog(false); setTicketDialogIds([]); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="dialog-ticket-confirm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MailCheck className="h-5 w-5" />
              Send Tickets & Reconcile
            </DialogTitle>
            <DialogDescription>
              Some selected orders are missing in Stripe. Would you like to generate tickets and send email invitations to these customers?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 my-4">
            <p className="text-sm font-medium text-muted-foreground">Customers who will receive tickets:</p>
            <div className="rounded-lg border divide-y max-h-[300px] overflow-y-auto">
              {(() => {
                const csvOnlyItems = divergences.filter(d =>
                  ticketDialogIds.includes(d.id) && d.type === "missing_in_stripe" && d.source === "csv"
                );
                if (csvOnlyItems.length === 0) return (
                  <p className="p-3 text-sm text-muted-foreground">No CSV-only orders in selection</p>
                );
                return csvOnlyItems.map(d => (
                  <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2" data-testid={`ticket-preview-${d.id}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`ticket-name-${d.id}`}>{d.billingName || "Guest"}</p>
                      <p className="text-xs text-muted-foreground truncate" data-testid={`ticket-email-${d.id}`}>{d.email || "No email"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className="text-xs">{d.eventDate || "—"}</Badge>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.csvTicketType || "General"}</p>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                applyMutation.mutate({ action: "reconcile", ids: ticketDialogIds });
                setShowTicketDialog(false);
                setTicketDialogIds([]);
              }}
              disabled={applyMutation.isPending || generateTicketsMutation.isPending}
              data-testid="button-reconcile-only"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Reconcile Only
            </Button>
            <Button
              onClick={() => {
                const csvOnlyIds = divergences
                  .filter(d => ticketDialogIds.includes(d.id) && d.type === "missing_in_stripe" && d.source === "csv")
                  .map(d => d.id);
                const otherIds = ticketDialogIds.filter(id => !csvOnlyIds.includes(id));
                if (otherIds.length > 0) {
                  applyMutation.mutate({ action: "reconcile", ids: otherIds });
                }
                if (csvOnlyIds.length > 0) {
                  generateTicketsMutation.mutate(csvOnlyIds);
                }
              }}
              disabled={generateTicketsMutation.isPending}
              data-testid="button-send-tickets"
            >
              {generateTicketsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Send Tickets & Reconcile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditEventDialog} onOpenChange={(open) => { if (!open) { setShowEditEventDialog(false); setEditEventTarget(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-event">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit Event
            </DialogTitle>
            <DialogDescription>
              Update event details and location information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input value={editEventForm.name} onChange={e => setEditEventForm(f => ({ ...f, name: e.target.value }))} placeholder="Event name" data-testid="input-edit-event-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input value={editEventForm.date} onChange={e => setEditEventForm(f => ({ ...f, date: e.target.value }))} placeholder="e.g. LA | May 2nd" data-testid="input-edit-event-date" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Time</label>
                <Input value={editEventForm.time} onChange={e => setEditEventForm(f => ({ ...f, time: e.target.value }))} placeholder="e.g. 11 AM - 1PM" data-testid="input-edit-event-time" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Event Type</label>
                <Select value={editEventForm.eventType} onValueChange={v => setEditEventForm(f => ({ ...f, eventType: v }))}>
                  <SelectTrigger data-testid="select-edit-event-type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Members">Members</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="VIP">VIP</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Location</label>
                <Input value={editEventForm.location} onChange={e => setEditEventForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. San Diego, CA" data-testid="input-edit-event-location" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Capacity</label>
                <Input type="number" value={editEventForm.capacity} onChange={e => setEditEventForm(f => ({ ...f, capacity: e.target.value }))} placeholder="e.g. 50" data-testid="input-edit-event-capacity" />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Address</p>
              <div className="space-y-2">
                <Input value={editEventForm.locationStreet} onChange={e => setEditEventForm(f => ({ ...f, locationStreet: e.target.value }))} placeholder="Street address" data-testid="input-edit-event-street" />
                <div className="grid grid-cols-2 gap-2">
                  <Input value={editEventForm.locationCity} onChange={e => setEditEventForm(f => ({ ...f, locationCity: e.target.value }))} placeholder="City" data-testid="input-edit-event-city" />
                  <Input value={editEventForm.locationZip} onChange={e => setEditEventForm(f => ({ ...f, locationZip: e.target.value }))} placeholder="ZIP" data-testid="input-edit-event-zip" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowEditEventDialog(false); setEditEventTarget(null); }}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editEventTarget) return;
                saveEditEventMutation.mutate({
                  id: editEventTarget.id,
                  eventData: {
                    name: editEventForm.name,
                    date: editEventForm.date,
                    time: editEventForm.time,
                    eventType: editEventForm.eventType,
                    location: editEventForm.location,
                    capacity: editEventForm.capacity,
                  },
                  ednData: {
                    eventDate: editEventForm.date,
                    eventName: editEventForm.name,
                    locationStreet: editEventForm.locationStreet || undefined,
                    locationCity: editEventForm.locationCity || undefined,
                    locationZip: editEventForm.locationZip || undefined,
                  },
                });
              }}
              disabled={!editEventForm.name.trim() || !editEventForm.date.trim() || saveEditEventMutation.isPending}
              data-testid="button-confirm-edit-event"
            >
              {saveEditEventMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddEventDialog} onOpenChange={(open) => { if (!open) setShowAddEventDialog(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-add-event">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Event
            </DialogTitle>
            <DialogDescription>
              Create a new event manually. When Stripe receives a matching purchase, it will link automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input placeholder="e.g. LA | May 2nd, 11 AM - 1PM, GA Ticket Access" value={addEventForm.name} onChange={e => setAddEventForm(f => ({ ...f, name: e.target.value }))} data-testid="input-add-event-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input placeholder="e.g. LA | May 2nd" value={addEventForm.date} onChange={e => setAddEventForm(f => ({ ...f, date: e.target.value }))} data-testid="input-add-event-date" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Time</label>
                <Input placeholder="e.g. 11 AM - 1PM" value={addEventForm.time} onChange={e => setAddEventForm(f => ({ ...f, time: e.target.value }))} data-testid="input-add-event-time" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Event Type</label>
                <Input placeholder="e.g. GA Ticket Access" value={addEventForm.eventType} onChange={e => setAddEventForm(f => ({ ...f, eventType: e.target.value }))} data-testid="input-add-event-type" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Location</label>
                <Input placeholder="e.g. Los Angeles" value={addEventForm.location} onChange={e => setAddEventForm(f => ({ ...f, location: e.target.value }))} data-testid="input-add-event-location" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Capacity</label>
                <Input type="number" placeholder="e.g. 50" value={addEventForm.capacity} onChange={e => setAddEventForm(f => ({ ...f, capacity: e.target.value }))} data-testid="input-add-event-capacity" />
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Address (optional)</p>
              <div className="space-y-2">
                <Input placeholder="Street address" value={addEventForm.locationStreet} onChange={e => setAddEventForm(f => ({ ...f, locationStreet: e.target.value }))} data-testid="input-add-event-street" />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="City" value={addEventForm.locationCity} onChange={e => setAddEventForm(f => ({ ...f, locationCity: e.target.value }))} data-testid="input-add-event-city" />
                  <Input placeholder="ZIP" value={addEventForm.locationZip} onChange={e => setAddEventForm(f => ({ ...f, locationZip: e.target.value }))} data-testid="input-add-event-zip" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddEventDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createEventMutation.mutate(addEventForm)}
              disabled={!addEventForm.name || !addEventForm.date || !addEventForm.eventType || createEventMutation.isPending}
              data-testid="button-confirm-add-event"
            >
              {createEventMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Create Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showFixTimesDialog} onOpenChange={(open) => { if (!open) setShowFixTimesDialog(false); }}>
        <DialogContent className="max-w-md" data-testid="dialog-fix-times">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Fix Times
            </DialogTitle>
            <DialogDescription>
              This action will make the following changes:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm my-2">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">1.</span>
              <span>Rename events to just their date (removing class name and time from the event title)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">2.</span>
              <span>Merge duplicate events with the same date (keep the first, move tickets)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">3.</span>
              <span>Fill in the class time on each ticket based on its type:
                <span className="block text-xs text-muted-foreground mt-1 ml-2">
                  GA Ticket Access → 11 AM - 1PM | Fever Pilates: Austen → 11 AM | Fever Pilates: Grazella → 12:30 PM | Mat Pilates with Lauren → 10 AM | Sculpt Class with Bray → 12 PM
                </span>
              </span>
            </div>
          </div>
          <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">This action cannot be undone. Do you want to continue?</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowFixTimesDialog(false)}>Cancel</Button>
            <Button
              onClick={() => fixTimesMutation.mutate()}
              disabled={fixTimesMutation.isPending}
              data-testid="button-confirm-fix-times"
            >
              {fixTimesMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Apply Fix Times
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSplitDialog} onOpenChange={(open) => { if (!open) { setShowSplitDialog(false); setSplitSourceEventId(null); setSplitSelectedTickets(new Set()); setSplitTargetEventId(""); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-split-event">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Split Event — Move Selected Tickets
            </DialogTitle>
            <DialogDescription>
              Select the tickets you want to move to a different event. Unselected tickets will stay in "{eventsData?.find((e: any) => e.id === splitSourceEventId)?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 my-2">
            <label className="text-sm font-medium">Tickets in this event:</label>
            <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
              {splitTicketsData && splitTicketsData.length > 0 ? splitTicketsData.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
                    <Checkbox
                      checked={splitSelectedTickets.has(t.id)}
                      onCheckedChange={(checked) => {
                        const next = new Set(splitSelectedTickets);
                        if (checked) next.add(t.id); else next.delete(t.id);
                        setSplitSelectedTickets(next);
                      }}
                      data-testid={`checkbox-split-ticket-${t.id}`}
                    />
                    <span className="font-medium">{t.billingName || t.email}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{t.ticketType}{t.ticketTime ? ` · ${t.ticketTime}` : ""}</span>
                  </label>
                )) : <p className="text-sm text-muted-foreground py-2">No tickets found</p>}
            </div>
            <label className="text-sm font-medium">Move to event:</label>
            <Select value={splitTargetEventId} onValueChange={setSplitTargetEventId}>
              <SelectTrigger data-testid="select-split-target">
                <SelectValue placeholder="Select target event..." />
              </SelectTrigger>
              <SelectContent>
                {(eventsData || [])
                  .filter((e: any) => e.id !== splitSourceEventId)
                  .map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} ({e.ticketCount} tickets)
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">{splitSelectedTickets.size} ticket(s) selected to move</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSplitDialog(false)}>Cancel</Button>
            <Button
              disabled={splitSelectedTickets.size === 0 || !splitTargetEventId || moveTicketsMutation.isPending}
              onClick={() => moveTicketsMutation.mutate({ ticketIds: Array.from(splitSelectedTickets), targetEventId: splitTargetEventId })}
              data-testid="button-confirm-split"
            >
              {moveTicketsMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Move {splitSelectedTickets.size} Ticket(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMergeDialog} onOpenChange={(open) => { if (!open) { setShowMergeDialog(false); setMergeSourceId(null); setMergeTargetId(""); } }}>
        <DialogContent className="max-w-md" data-testid="dialog-merge-event">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-5 w-5" />
              Move Tickets to Another Event
            </DialogTitle>
            <DialogDescription>
              All tickets from "{eventsData?.find((e: any) => e.id === mergeSourceId)?.name}" will be moved to the selected event. The source event will be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 my-2">
            <label className="text-sm font-medium">Target event (keep):</label>
            <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
              <SelectTrigger data-testid="select-merge-target">
                <SelectValue placeholder="Select target event..." />
              </SelectTrigger>
              <SelectContent>
                {(eventsData || [])
                  .filter((e: any) => e.id !== mergeSourceId)
                  .map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name} <span className="text-muted-foreground ml-1">({e.ticketCount} tickets)</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowMergeDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!mergeTargetId || mergeEventsMutation.isPending}
              onClick={() => mergeSourceId && mergeEventsMutation.mutate({ keepId: mergeTargetId, mergeIds: [mergeSourceId] })}
              data-testid="button-confirm-merge"
            >
              {mergeEventsMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Move Tickets & Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCsvImport} onOpenChange={(open) => { if (!open) { setShowCsvImport(false); setCsvFile(null); setCsvPreview([]); setCsvResult(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-csv-import">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Hostinger CSV
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file exported from Hostinger to import orders for reconciliation
            </DialogDescription>
          </DialogHeader>

          {csvResult && (
            <div className="rounded-lg border p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800" data-testid="csv-import-result">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="font-medium text-sm">Import Complete</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setCsvResult(null)} data-testid="button-dismiss-csv-result">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-2xl font-bold" data-testid="text-csv-imported">{csvResult.imported}</p>
                  <p className="text-xs text-muted-foreground">Imported</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-csv-total">{csvResult.totalParsed}</p>
                  <p className="text-xs text-muted-foreground">Total Parsed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-csv-skipped">{csvResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
                <div>
                  <p className="text-lg font-bold truncate" data-testid="text-csv-file">{csvResult.upload?.fileName}</p>
                  <p className="text-xs text-muted-foreground">File</p>
                </div>
              </div>
              {csvResult.duplicatesInCsv?.length > 0 || csvResult.duplicatesInDb?.length > 0 ? (
                <div className="mt-3 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
                      {(csvResult.duplicatesInCsv?.length || 0) + (csvResult.duplicatesInDb?.length || 0)} duplicate(s) detected
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[...(csvResult.duplicatesInCsv || []), ...(csvResult.duplicatesInDb || [])].slice(0, 10).map((dup: any, idx: number) => (
                      <Badge key={`${dup.orderNumber}-${idx}`} variant="outline" className="text-xs">
                        {dup.orderNumber} ({dup.existingSource})
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          <div
            onDrop={handleCsvDrop}
            onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
            onDragLeave={() => setCsvDragOver(false)}
            onClick={() => csvFileRef.current?.click()}
            className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
              csvDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            data-testid="csv-dropzone"
          >
            <input
              ref={csvFileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleCsvFile(file); e.target.value = ""; }}
              data-testid="csv-file-input"
            />
            <FileUp className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium">{csvFile ? csvFile.name : "Drop a CSV file here or click to browse"}</p>
            <p className="text-xs text-muted-foreground mt-1">Hostinger exported orders CSV format</p>
          </div>

          {csvFile && csvPreview.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium" data-testid="text-csv-preview-info">
                    Preview: {csvPreview.length} rows {csvPreview.length === 20 ? "(first 20)" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setCsvFile(null); setCsvPreview([]); }} data-testid="button-csv-cancel">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => { if (csvFile) csvUploadMutation.mutate(csvFile); }} disabled={csvUploadMutation.isPending} data-testid="button-csv-confirm">
                    {csvUploadMutation.isPending ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importing...</>) : (<><Upload className="h-4 w-4 mr-1" />Confirm Import</>)}
                  </Button>
                </div>
              </div>
              <div className="rounded-md border overflow-x-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvPreview.map((row, idx) => (
                      <TableRow key={idx} data-testid={`csv-preview-row-${idx}`}>
                        <TableCell className="font-mono text-xs">{row.orderNumber}</TableCell>
                        <TableCell className="text-xs">{row.email}</TableCell>
                        <TableCell className="text-xs">{row.billingName}</TableCell>
                        <TableCell className="text-xs max-w-[180px] truncate">{row.product}</TableCell>
                        <TableCell className="text-xs">{row.price}</TableCell>
                        <TableCell className="text-xs">{row.quantity}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{row.status || "N/A"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium">Upload History</h4>
            {csvUploadsLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : !csvUploads || csvUploads.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center" data-testid="text-no-csv-uploads">No uploads yet</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvUploads.map((upload) => (
                      <TableRow key={upload.id} data-testid={`csv-upload-row-${upload.id}`}>
                        <TableCell className="font-medium text-xs">{upload.fileName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {upload.uploadedAt ? new Date(upload.uploadedAt).toLocaleString() : "N/A"}
                        </TableCell>
                        <TableCell className="text-xs">{upload.recordCount}</TableCell>
                        <TableCell>
                          <Badge variant={upload.status === "active" ? "default" : "secondary"} className="text-xs">
                            {upload.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {upload.status === "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (confirm(`Revert "${upload.fileName}"? This deletes ${upload.recordCount} imported records.`)) {
                                  csvRevertMutation.mutate(upload.id);
                                }
                              }}
                              disabled={csvRevertMutation.isPending}
                              data-testid={`button-csv-revert-${upload.id}`}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Revert
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
