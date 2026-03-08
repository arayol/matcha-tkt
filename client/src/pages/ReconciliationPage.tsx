import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  GitCompareArrows, AlertTriangle, CheckCircle2, XCircle,
  Download, Filter, Edit2, Check, X, Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  const [filterDate, setFilterDate] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ billingName: "", email: "", price: "", parsedTicketType: "" });

  const { data, isLoading } = useQuery<ReconciliationData>({
    queryKey: ["/api/admin/reconciliation"],
  });

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

  const divergences = data?.divergences || [];
  const summary = data?.summary;

  const filtered = divergences.filter((d) => {
    if (filterType !== "all" && d.type !== filterType) return false;
    if (filterOrderType !== "all" && d.orderType !== filterOrderType) return false;
    if (filterDate && d.eventDate && !d.eventDate.includes(filterDate)) return false;
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

  return (
    <AppLayout dark={dark} toggleTheme={toggleTheme} onLogout={onLogout} user={user} activePath="/admin/reconciliation" data-testid="reconciliation-page">
      <div className="space-y-6">
        <div className="hidden md:flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">Reconciliation</h1>
            <p className="text-sm text-muted-foreground mt-1">Compare CSV imports with Stripe records</p>
          </div>
          <Button onClick={handleExport} variant="outline" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
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
                <Input
                  type="text"
                  placeholder="Filter by date..."
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-[160px]"
                  data-testid="input-filter-date"
                />
              </div>
            </Card>

            {selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground" data-testid="text-selected-count">
                  {selectedIds.size} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => applyMutation.mutate({ action: "reconcile", ids: Array.from(selectedIds) })}
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

            <div className="md:hidden pb-4">
              <Button onClick={handleExport} variant="outline" className="w-full" data-testid="button-export-mobile">
                <Download className="h-4 w-4 mr-2" />
                Export Divergences CSV
              </Button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
