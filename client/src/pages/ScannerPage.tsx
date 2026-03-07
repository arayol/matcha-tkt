import { useState, useEffect, useRef, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  ScanLine, CheckCircle2, XCircle, AlertTriangle,
  Camera, RefreshCw, Ticket,
  Clock, Users, Search, UserCheck,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/AppLayout";

type ScanState = "idle" | "scanning" | "loading" | "success" | "error_used" | "error_invalid" | "error_camera";
type TabId = "scanner" | "activity" | "guests";

interface ValidationResult {
  message?: string;
  ticket?: {
    id: string;
    purchaserName: string;
    purchaserEmail: string;
    ticketType: string;
    status: string;
    usedAt?: string;
  };
  event?: {
    name: string;
    date: string;
    time: string;
    location: string;
  };
  error?: string;
}

interface ScannerStats {
  totalTickets: number;
  checkedIn: number;
  remaining: number;
  recentScans: {
    id: string;
    purchaserName: string;
    ticketType: string;
    usedAt: string;
  }[];
  guestList: {
    id: string;
    purchaserName: string;
    purchaserEmail: string;
    ticketType: string;
    status: string;
    usedAt: string | null;
  }[];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface ScannerPageProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

export default function ScannerPage({ dark, toggleTheme, onLogout, user }: ScannerPageProps) {
  const [state, setState] = useState<ScanState>("idle");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("scanner");
  const [guestSearch, setGuestSearch] = useState("");
  const [guestFilter, setGuestFilter] = useState<"all" | "pending" | "arrived">("all");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const mountedRef = useRef(true);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery<ScannerStats>({
    queryKey: ["/api/scanner/stats"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    return () => { mountedRef.current = false; };
  }, []);

  const stopScanner = useCallback(async () => {
    isScanningRef.current = false;
    if (scannerRef.current) {
      try {
        const s = scannerRef.current;
        scannerRef.current = null;
        await s.stop();
        s.clear();
      } catch (_) {}
    }
  }, []);

  const startScanner = useCallback(async () => {
    setState("scanning");
    setResult(null);

    await new Promise((r) => setTimeout(r, 100));

    try {
      const el = document.getElementById("qr-reader");
      if (!el) {
        console.error("qr-reader element not found in DOM");
        setState("error_camera");
        return;
      }

      await stopScanner();

      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          if (isScanningRef.current) {
            await stopScanner();
            await validateQR(decodedText);
          }
        },
        () => {}
      );

      isScanningRef.current = true;
    } catch (err: any) {
      console.error("Camera error:", err);
      if (mountedRef.current) setState("error_camera");
    }
  }, [stopScanner]);

  const validateQR = async (qrData: string) => {
    setState("loading");
    try {
      const res = await apiRequest("POST", "/api/tickets/validate-qr", { qrData });
      const data: ValidationResult = await res.json();
      setResult(data);
      setState("success");
      if (navigator.vibrate) navigator.vibrate([200]);
      queryClient.invalidateQueries({ queryKey: ["/api/scanner/stats"] });
    } catch (err: any) {
      try {
        const body = await fetch("/api/tickets/validate-qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrData }),
        });
        const json: ValidationResult = await body.json();
        setResult(json);
        if (json.error?.includes("already used")) {
          setState("error_used");
        } else {
          setState("error_invalid");
        }
      } catch (_) {
        setResult({ error: "Invalid QR code" });
        setState("error_invalid");
      }
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    }
  };

  const handleScanNext = async () => {
    setResult(null);
    await startScanner();
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const checkedIn = stats?.checkedIn ?? 0;
  const total = stats?.totalTickets ?? 0;
  const remaining = stats?.remaining ?? 0;
  const progress = total > 0 ? (checkedIn / total) * 100 : 0;

  const filteredGuests = (stats?.guestList ?? []).filter((g) => {
    const matchesSearch =
      !guestSearch ||
      g.purchaserName.toLowerCase().includes(guestSearch.toLowerCase()) ||
      g.purchaserEmail.toLowerCase().includes(guestSearch.toLowerCase());
    const matchesFilter =
      guestFilter === "all" ||
      (guestFilter === "pending" && g.status === "valid") ||
      (guestFilter === "arrived" && g.status === "used");
    return matchesSearch && matchesFilter;
  });

  const scannerContent = (
    <div className="flex flex-col min-h-[calc(100vh-140px)] md:min-h-0" data-testid="scanner-page">
      <div className="px-4 py-2.5 border-b border-card-border rounded-t-3xl bg-card">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {checkedIn} / {total} checked in
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {remaining} remaining
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-muted">
          <div
            className="h-full rounded-full bg-[#7a9956] transition-all duration-500"
            style={{ width: `${progress}%` }}
            data-testid="progress-bar"
          />
        </div>
      </div>

      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "scanner" && (
          <div className="flex-1 flex flex-col" data-testid="tab-scanner">
            <div id="qr-reader" className={`w-full ${state === "scanning" ? "flex-1" : "hidden"}`} style={{ minHeight: state === "scanning" ? "55vh" : 0 }} />

            {state === "idle" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5" data-testid="state-idle">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#7a9956]/10 dark:bg-[#7a9956]/15">
                  <ScanLine className="h-10 w-10 text-[#7a9956]" />
                </div>
                <div className="text-center space-y-1.5">
                  <h1 className="text-xl font-semibold">Ticket Scanner</h1>
                  <p className="text-sm max-w-xs text-muted-foreground">
                    Point the camera at a QR code to validate entry.
                  </p>
                </div>
                <button
                  onClick={startScanner}
                  className="flex items-center gap-2.5 bg-[#7a9956] text-white px-7 py-3.5 rounded-2xl font-semibold text-sm shadow-lg active:scale-95 transition-transform"
                  data-testid="button-start-scan"
                >
                  <Camera className="h-5 w-5" />
                  Start Scanning
                </button>
              </div>
            )}

            {state === "scanning" && (
              <div className="p-4 border-t border-card-border bg-card">
                <div className="flex items-center gap-2 justify-center mb-3">
                  <div className="h-2 w-2 rounded-full bg-[#7a9956] animate-pulse" />
                  <p className="text-sm font-medium">Scanning for QR code...</p>
                </div>
                <button
                  onClick={async () => { await stopScanner(); setState("idle"); }}
                  className="w-full py-2.5 rounded-xl border border-card-border text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
                  data-testid="button-cancel-scan"
                >
                  Cancel
                </button>
              </div>
            )}

            {state === "loading" && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6" data-testid="state-loading">
                <div className="h-10 w-10 rounded-full border-3 border-[#7a9956] border-t-transparent animate-spin" />
                <p className="font-medium text-sm text-muted-foreground">Validating ticket...</p>
              </div>
            )}

            {state === "success" && result && (
              <div className="flex-1 flex flex-col p-4 gap-3" data-testid="state-success">
                <div className="rounded-2xl p-5 flex flex-col items-center gap-2 text-center bg-green-50 border border-green-200 dark:bg-green-950/40 dark:border-green-800/50">
                  <CheckCircle2 className="h-14 w-14 text-green-500" />
                  <p className="text-xl font-bold text-green-500">VALID</p>
                  <p className="text-xs text-muted-foreground">Ticket accepted — let them in!</p>
                </div>

                <div className="rounded-2xl p-4 space-y-2.5 border border-card-border bg-card" data-testid="result-card">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#7a9956]/15">
                      <Ticket className="h-4 w-4 text-[#7a9956]" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" data-testid="result-name">{result.ticket?.purchaserName}</p>
                      <p className="text-xs text-muted-foreground" data-testid="result-email">{result.ticket?.purchaserEmail}</p>
                    </div>
                  </div>
                  <div className="h-px bg-card-border" />
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Type</p>
                      <p className="font-medium" data-testid="result-type">{result.ticket?.ticketType}</p>
                    </div>
                    {result.event && (
                      <div>
                        <p className="text-muted-foreground">Event</p>
                        <p className="font-medium" data-testid="result-event">{result.event.date} · {result.event.time}</p>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleScanNext}
                  className="flex items-center justify-center gap-2 bg-[#7a9956] text-white py-3 rounded-2xl font-semibold text-sm shadow-lg active:scale-95 transition-transform"
                  data-testid="button-scan-next"
                >
                  <RefreshCw className="h-4 w-4" />
                  Scan Next
                </button>
              </div>
            )}

            {state === "error_used" && result && (
              <div className="flex-1 flex flex-col p-4 gap-3" data-testid="state-error-used">
                <div className="rounded-2xl p-5 flex flex-col items-center gap-2 text-center bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/40 dark:border-yellow-800/50">
                  <AlertTriangle className="h-14 w-14 text-yellow-500" />
                  <p className="text-xl font-bold text-yellow-500">ALREADY USED</p>
                  <p className="text-xs text-muted-foreground">
                    {result.ticket?.usedAt
                      ? `Used ${timeAgo(result.ticket.usedAt)}`
                      : "This ticket has already been scanned"}
                  </p>
                </div>

                {result.ticket && (
                  <div className="rounded-2xl p-4 border border-card-border bg-card" data-testid="result-card-used">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-500/15">
                        <Ticket className="h-4 w-4 text-yellow-500" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm" data-testid="result-used-name">{result.ticket.purchaserName}</p>
                        <p className="text-xs text-muted-foreground">{result.ticket.ticketType}</p>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleScanNext}
                  className="flex items-center justify-center gap-2 bg-[#7a9956] text-white py-3 rounded-2xl font-semibold text-sm shadow-lg active:scale-95 transition-transform"
                  data-testid="button-scan-next-used"
                >
                  <RefreshCw className="h-4 w-4" />
                  Scan Next
                </button>
              </div>
            )}

            {state === "error_invalid" && (
              <div className="flex-1 flex flex-col p-4 gap-3" data-testid="state-error-invalid">
                <div className="rounded-2xl p-5 flex flex-col items-center gap-2 text-center bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-800/50">
                  <XCircle className="h-14 w-14 text-red-500" />
                  <p className="text-xl font-bold text-red-500">INVALID</p>
                  <p className="text-xs text-muted-foreground">
                    {result?.error || "This QR code is not a valid ticket."}
                  </p>
                </div>

                <button
                  onClick={handleScanNext}
                  className="flex items-center justify-center gap-2 bg-[#7a9956] text-white py-3 rounded-2xl font-semibold text-sm shadow-lg active:scale-95 transition-transform"
                  data-testid="button-scan-next-invalid"
                >
                  <RefreshCw className="h-4 w-4" />
                  Scan Next
                </button>

                <button
                  onClick={() => { setResult(null); setState("idle"); }}
                  className="py-2.5 rounded-xl border border-card-border text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
                  data-testid="button-back-idle"
                >
                  Back
                </button>
              </div>
            )}

            {state === "error_camera" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5" data-testid="state-error-camera">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30">
                  <Camera className="h-10 w-10 text-red-500" />
                </div>
                <div className="text-center space-y-1.5">
                  <h2 className="text-lg font-semibold">Camera Access Required</h2>
                  <p className="text-sm max-w-xs text-muted-foreground">
                    Please allow camera access in your browser settings.
                  </p>
                </div>
                <div className="rounded-xl p-3 text-xs space-y-0.5 max-w-xs border border-card-border bg-card text-muted-foreground">
                  <p className="font-medium text-foreground">How to enable:</p>
                  <p>iOS: Settings → Safari → Camera → Allow</p>
                  <p>Android: Site Settings → Camera → Allow</p>
                </div>
                <button
                  onClick={startScanner}
                  className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-[#7a9956] text-white text-sm font-medium active:scale-95 transition-transform"
                  data-testid="button-retry-camera"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "activity" && (
          <div className="flex-1 overflow-y-auto" data-testid="tab-activity">
            <div className="px-4 py-3 border-b border-card-border">
              <h2 className="font-semibold text-sm">Scan History</h2>
              <p className="text-xs text-muted-foreground">{stats?.recentScans.length ?? 0} recent scans</p>
            </div>

            {(stats?.recentScans ?? []).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Clock className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No scans yet</p>
              </div>
            ) : (
              <div className="divide-y divide-card-border">
                {stats!.recentScans.map((scan) => (
                  <div
                    key={scan.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                    data-testid={`scan-item-${scan.id}`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/15 flex-shrink-0">
                      <UserCheck className="h-4 w-4 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{scan.purchaserName}</p>
                      <p className="text-xs text-muted-foreground">{scan.ticketType}</p>
                    </div>
                    <span className="text-xs flex-shrink-0 text-muted-foreground">
                      {timeAgo(scan.usedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "guests" && (
          <div className="flex-1 flex flex-col overflow-hidden" data-testid="tab-guests">
            <div className="px-4 py-3 space-y-2.5 border-b border-card-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search guests..."
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none transition-colors bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
                  data-testid="input-guest-search"
                />
              </div>
              <div className="flex gap-1.5">
                {(["all", "pending", "arrived"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setGuestFilter(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      guestFilter === f
                        ? "bg-[#7a9956] text-white"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                    }`}
                    data-testid={`filter-${f}`}
                  >
                    {f === "all" ? `All (${stats?.guestList.length ?? 0})` : f === "pending" ? `Pending (${remaining})` : `Arrived (${checkedIn})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredGuests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Users className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {guestSearch ? "No matching guests" : "No guests yet"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-card-border">
                  {filteredGuests.map((guest) => (
                    <div
                      key={guest.id}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                      data-testid={`guest-item-${guest.id}`}
                    >
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl flex-shrink-0 ${
                        guest.status === "used" ? "bg-green-500/15" : "bg-[#7a9956]/15"
                      }`}>
                        {guest.status === "used" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Ticket className="h-4 w-4 text-[#7a9956]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{guest.purchaserName}</p>
                        <p className="text-xs truncate text-muted-foreground">{guest.purchaserEmail}</p>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                          guest.status === "used"
                            ? "bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-400"
                            : "bg-[#7a9956]/10 text-[#5a7340] dark:bg-[#7a9956]/15 dark:text-[#7a9956]"
                        }`} data-testid={`guest-status-${guest.id}`}>
                          {guest.status === "used" ? "Arrived" : "Pending"}
                        </span>
                        <span className="text-[10px] mt-0.5 text-muted-foreground">
                          {guest.ticketType}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <nav className="flex border-t border-card-border bg-card safe-bottom md:rounded-b-3xl">
        {([
          { id: "scanner" as TabId, icon: ScanLine, label: "Scanner" },
          { id: "activity" as TabId, icon: Clock, label: "Activity" },
          { id: "guests" as TabId, icon: Users, label: "Guests" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (tab.id !== "scanner" && state === "scanning") {
                stopScanner().then(() => setState("idle"));
              }
              setActiveTab(tab.id);
            }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
              activeTab === tab.id
                ? "text-[#7a9956]"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon className="h-5 w-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <AppLayout dark={dark} toggleTheme={toggleTheme} onLogout={onLogout} user={user} activePath="/scan">
      {scannerContent}
    </AppLayout>
  );
}
