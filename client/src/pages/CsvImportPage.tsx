import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FileSpreadsheet, Upload, AlertTriangle, CheckCircle2,
  RotateCcw, X, FileUp, Loader2,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CsvUpload, HostingerOrder } from "@shared/schema";

interface CsvImportPageProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

interface UploadResponse {
  upload: CsvUpload;
  imported: number;
  totalParsed: number;
  duplicatesInCsv: { orderNumber: string; reason: string; existingSource: string }[];
  duplicatesInDb: { orderNumber: string; reason: string; existingSource: string }[];
  skipped: number;
}

interface ParsedPreviewRow {
  orderNumber: string;
  email: string;
  billingName: string;
  phone: string;
  product: string;
  price: string;
  subtotal: string;
  discountCode: string;
  quantity: string;
  status: string;
}

export default function CsvImportPage({ dark, toggleTheme, onLogout, user }: CsvImportPageProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedPreviewRow[]>([]);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);

  const { data: uploads, isLoading: uploadsLoading } = useQuery<CsvUpload[]>({
    queryKey: ["/api/admin/csv/uploads"],
  });

  const uploadMutation = useMutation({
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
      return res.json() as Promise<UploadResponse>;
    },
    onSuccess: (data) => {
      setUploadResult(data);
      setSelectedFile(null);
      setPreviewRows([]);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/orders"] });
      toast({
        title: "CSV imported successfully",
        description: `${data.imported} records imported${data.skipped > 0 ? `, ${data.skipped} duplicates skipped` : ""}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/csv/uploads/${id}/revert`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/csv/orders"] });
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
            if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            current += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            fields.push(current.trim());
            current = "";
          } else {
            current += ch;
          }
        }
      }
      fields.push(current.trim());
      return fields;
    };

    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);

    const findCol = (names: string[]) => {
      for (const name of names) {
        const lower = name.toLowerCase();
        const idx = headers.findIndex((h) => h.toLowerCase() === lower);
        if (idx !== -1) return idx;
      }
      for (const name of names) {
        const lower = name.toLowerCase();
        const idx = headers.findIndex((h) => h.toLowerCase().includes(lower));
        if (idx !== -1) return idx;
      }
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

    const rows: ParsedPreviewRow[] = [];
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

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        toast({ title: "Please select a CSV file", variant: "destructive" });
        return;
      }
      setSelectedFile(file);
      setUploadResult(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const rows = parseCsvPreview(text);
        setPreviewRows(rows);
      };
      reader.readAsText(file);
    },
    [parseCsvPreview, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  return (
    <AppLayout dark={dark} toggleTheme={toggleTheme} onLogout={onLogout} user={user} activePath="/admin/csv" data-testid="csv-import-page">
      <div className="space-y-6">
        <div className="hidden md:flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">CSV Import</h1>
            <p className="text-sm text-muted-foreground mt-1">Import Hostinger orders from CSV files</p>
          </div>
        </div>

        {uploadResult && (
          <Card data-testid="card-import-result">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                Import Complete
              </CardTitle>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setUploadResult(null)}
                data-testid="button-dismiss-result"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-2xl font-bold" data-testid="text-imported-count">{uploadResult.imported}</p>
                  <p className="text-xs text-muted-foreground">Records Imported</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-total-parsed">{uploadResult.totalParsed}</p>
                  <p className="text-xs text-muted-foreground">Total Parsed</p>
                </div>
                <div>
                  <p className="text-2xl font-bold" data-testid="text-duplicate-count">{uploadResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Duplicates Skipped</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-sm" data-testid="text-upload-file">{uploadResult.upload.fileName}</p>
                  <p className="text-xs text-muted-foreground">File Name</p>
                </div>
              </div>
              {(uploadResult.duplicatesInCsv.length > 0 || uploadResult.duplicatesInDb.length > 0) && (
                <div className="mt-4 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300" data-testid="text-duplicate-warning">
                      {uploadResult.duplicatesInCsv.length + uploadResult.duplicatesInDb.length} duplicate order(s) detected
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[...uploadResult.duplicatesInCsv, ...uploadResult.duplicatesInDb].slice(0, 20).map((dup, idx) => (
                      <Badge key={`${dup.orderNumber}-${idx}`} variant="outline" className="text-xs" data-testid={`badge-duplicate-${dup.orderNumber}`}>
                        {dup.orderNumber} ({dup.existingSource})
                      </Badge>
                    ))}
                    {(uploadResult.duplicatesInCsv.length + uploadResult.duplicatesInDb.length) > 20 && (
                      <Badge variant="outline" className="text-xs">
                        +{(uploadResult.duplicatesInCsv.length + uploadResult.duplicatesInDb.length) - 20} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-upload-zone">
          <CardContent className="pt-6">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
              data-testid="dropzone"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                  e.target.value = "";
                }}
                data-testid="input-file"
              />
              <FileUp className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">
                {selectedFile ? selectedFile.name : "Drop a CSV file here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Hostinger exported orders CSV format
              </p>
            </div>

            {selectedFile && previewRows.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium" data-testid="text-preview-info">
                      Preview: {previewRows.length} rows {previewRows.length === 20 ? "(showing first 20)" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewRows([]);
                      }}
                      data-testid="button-cancel-upload"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedFile) uploadMutation.mutate(selectedFile);
                      }}
                      disabled={uploadMutation.isPending}
                      data-testid="button-confirm-upload"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Confirm Import
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Subtotal</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, idx) => (
                        <TableRow key={idx} data-testid={`preview-row-${idx}`}>
                          <TableCell className="font-mono text-xs">{row.orderNumber}</TableCell>
                          <TableCell className="text-xs">{row.email}</TableCell>
                          <TableCell className="text-xs">{row.billingName}</TableCell>
                          <TableCell className="text-xs">{row.phone || "-"}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate">{row.product}</TableCell>
                          <TableCell className="text-xs">{row.price}</TableCell>
                          <TableCell className="text-xs">{row.subtotal || "-"}</TableCell>
                          <TableCell className="text-xs">{row.discountCode || "-"}</TableCell>
                          <TableCell className="text-xs">{row.quantity}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {row.status || "N/A"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-upload-history">
          <CardHeader>
            <CardTitle className="text-base font-medium">Upload History</CardTitle>
          </CardHeader>
          <CardContent>
            {uploadsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !uploads || uploads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <FileSpreadsheet className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground" data-testid="text-no-uploads">No uploads yet</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Name</TableHead>
                      <TableHead>Uploaded At</TableHead>
                      <TableHead>Uploaded By</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploads.map((upload) => (
                      <TableRow key={upload.id} data-testid={`upload-row-${upload.id}`}>
                        <TableCell className="font-medium text-sm">{upload.fileName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {upload.uploadedAt
                            ? new Date(upload.uploadedAt).toLocaleString()
                            : "N/A"}
                        </TableCell>
                        <TableCell className="text-xs">{upload.uploadedBy}</TableCell>
                        <TableCell className="text-xs" data-testid={`text-record-count-${upload.id}`}>
                          {upload.recordCount}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={upload.status === "active" ? "default" : "secondary"}
                            data-testid={`badge-status-${upload.id}`}
                          >
                            {upload.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {upload.status === "active" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                if (confirm(`Revert upload "${upload.fileName}"? This will delete all ${upload.recordCount} imported records.`)) {
                                  revertMutation.mutate(upload.id);
                                }
                              }}
                              disabled={revertMutation.isPending}
                              data-testid={`button-revert-${upload.id}`}
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
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
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
