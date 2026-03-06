import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { Html5Qrcode } from "html5-qrcode";
import { ScanLine, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, Camera, RefreshCw, Ticket } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type ScanState =
  | "idle"
  | "scanning"
  | "loading"
  | "success"
  | "error_used"
  | "error_invalid"
  | "error_camera";

interface ValidationResult {
  message: string;
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

export default function ScannerPage() {
  const [state, setState] = useState<ScanState>("idle");
  const [result, setResult] = useState<ValidationResult | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);

  const stopScanner = async () => {
    if (scannerRef.current && isScanningRef.current) {
      try {
        await scannerRef.current.stop();
        isScanningRef.current = false;
      } catch (_) {}
    }
  };

  const startScanner = async () => {
    setState("scanning");

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode("qr-reader");
      }

      if (isScanningRef.current) {
        await stopScanner();
      }

      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
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
      const msg = err?.message || "";
      if (msg.includes("Permission") || msg.includes("NotAllowed") || msg.includes("camera")) {
        setState("error_camera");
      } else {
        setState("error_camera");
      }
    }
  };

  const validateQR = async (qrData: string) => {
    setState("loading");
    try {
      const res = await apiRequest("POST", "/api/tickets/validate-qr", { qrData });
      const data: ValidationResult = await res.json();
      setResult(data);
      setState("success");
      if (navigator.vibrate) navigator.vibrate([200]);
    } catch (err: any) {
      let data: ValidationResult = { error: "Unknown error" };
      try {
        data = await err?.response?.json?.() || data;
      } catch (_) {}

      if (err?.message?.includes("400")) {
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
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        } catch (_) {
          setResult({ error: "Invalid QR code" });
          setState("error_invalid");
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }
      } else if (err?.message?.includes("404")) {
        setResult({ error: "Invalid QR code" });
        setState("error_invalid");
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      } else {
        setResult({ error: "Could not reach server" });
        setState("error_invalid");
      }
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
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="scanner-page">
      <header className="flex items-center justify-between px-5 pt-safe-top pb-3 pt-5 border-b border-card-border bg-card shadow-soft">
        <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors" data-testid="link-back-dashboard">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-sm">Dashboard</span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-bold">
            M
          </div>
          <span className="font-semibold text-sm">MOI Scanner</span>
        </div>
        <div className="w-20" />
      </header>

      <main className="flex-1 flex flex-col">

        {state === "idle" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6" data-testid="state-idle">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <ScanLine className="h-12 w-12" />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold">Ticket Scanner</h1>
              <p className="text-muted-foreground text-sm max-w-xs">
                Point the camera at the QR code on a ticket to validate entry.
              </p>
            </div>
            <button
              onClick={startScanner}
              className="flex items-center gap-3 bg-primary text-primary-foreground px-8 py-4 rounded-2xl font-semibold text-base shadow-soft active:scale-95 transition-transform"
              data-testid="button-start-scan"
            >
              <Camera className="h-5 w-5" />
              Start Scanning
            </button>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Camera permission will be requested when you start scanning.
            </p>
          </div>
        )}

        {state === "scanning" && (
          <div className="flex-1 flex flex-col" data-testid="state-scanning">
            <div
              id="qr-reader"
              className="w-full flex-1"
              style={{ minHeight: "60vh" }}
            />
            <div className="p-6 bg-card border-t border-card-border space-y-3">
              <div className="flex items-center gap-3 justify-center">
                <div className="flex h-2 w-2 rounded-full bg-status-online animate-pulse" />
                <p className="text-sm font-medium">Point at a ticket QR code</p>
              </div>
              <button
                onClick={async () => { await stopScanner(); setState("idle"); }}
                className="w-full py-3 rounded-2xl border border-card-border text-muted-foreground text-sm hover:bg-muted/30 transition-colors"
                data-testid="button-cancel-scan"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {state === "loading" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6" data-testid="state-loading">
            <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-muted-foreground font-medium">Validating ticket...</p>
          </div>
        )}

        {state === "success" && result && (
          <div className="flex-1 flex flex-col p-5 gap-4" data-testid="state-success">
            <div className="rounded-3xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-16 w-16 text-status-online" />
              <div>
                <p className="text-2xl font-bold text-status-online">VALID</p>
                <p className="text-sm text-muted-foreground mt-1">Ticket accepted — let them in!</p>
              </div>
            </div>

            <div className="rounded-3xl border border-card-border bg-card p-5 space-y-3" data-testid="result-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Ticket className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold" data-testid="result-name">{result.ticket?.purchaserName}</p>
                  <p className="text-xs text-muted-foreground" data-testid="result-email">{result.ticket?.purchaserEmail}</p>
                </div>
              </div>
              <div className="h-px bg-border" />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Ticket Type</p>
                  <p className="font-medium" data-testid="result-type">{result.ticket?.ticketType}</p>
                </div>
                {result.event && (
                  <div>
                    <p className="text-muted-foreground text-xs">Event</p>
                    <p className="font-medium" data-testid="result-event">{result.event.date} · {result.event.time}</p>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleScanNext}
              className="flex items-center justify-center gap-3 bg-primary text-primary-foreground py-4 rounded-2xl font-semibold shadow-soft active:scale-95 transition-transform"
              data-testid="button-scan-next"
            >
              <RefreshCw className="h-5 w-5" />
              Scan Next
            </button>
          </div>
        )}

        {state === "error_used" && result && (
          <div className="flex-1 flex flex-col p-5 gap-4" data-testid="state-error-used">
            <div className="rounded-3xl bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 p-6 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="h-16 w-16 text-status-away" />
              <div>
                <p className="text-2xl font-bold text-status-away">ALREADY USED</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result.ticket?.usedAt
                    ? `Used on ${new Date(result.ticket.usedAt).toLocaleString()}`
                    : "This ticket has already been scanned"}
                </p>
              </div>
            </div>

            {result.ticket && (
              <div className="rounded-3xl border border-card-border bg-card p-5 space-y-3" data-testid="result-card-used">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-100 dark:bg-yellow-950/50">
                    <Ticket className="h-5 w-5 text-status-away" />
                  </div>
                  <div>
                    <p className="font-semibold" data-testid="result-used-name">{result.ticket.purchaserName}</p>
                    <p className="text-xs text-muted-foreground">{result.ticket.ticketType}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleScanNext}
              className="flex items-center justify-center gap-3 bg-primary text-primary-foreground py-4 rounded-2xl font-semibold shadow-soft active:scale-95 transition-transform"
              data-testid="button-scan-next-used"
            >
              <RefreshCw className="h-5 w-5" />
              Scan Next
            </button>
          </div>
        )}

        {state === "error_invalid" && (
          <div className="flex-1 flex flex-col p-5 gap-4" data-testid="state-error-invalid">
            <div className="rounded-3xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-6 flex flex-col items-center gap-3 text-center">
              <XCircle className="h-16 w-16 text-status-busy" />
              <div>
                <p className="text-2xl font-bold text-status-busy">INVALID</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {result?.error || "This QR code is not a valid Matcha On Ice ticket."}
                </p>
              </div>
            </div>

            <button
              onClick={handleScanNext}
              className="flex items-center justify-center gap-3 bg-primary text-primary-foreground py-4 rounded-2xl font-semibold shadow-soft active:scale-95 transition-transform"
              data-testid="button-scan-next-invalid"
            >
              <RefreshCw className="h-5 w-5" />
              Scan Next
            </button>

            <button
              onClick={() => { setResult(null); setState("idle"); }}
              className="py-3 rounded-2xl border border-card-border text-muted-foreground text-sm hover:bg-muted/30 transition-colors"
              data-testid="button-back-idle"
            >
              Back
            </button>
          </div>
        )}

        {state === "error_camera" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6" data-testid="state-error-camera">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-red-50 dark:bg-red-950/30 text-status-busy">
              <Camera className="h-12 w-12" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">Camera Access Required</h2>
              <p className="text-muted-foreground text-sm max-w-xs">
                Please allow camera access in your browser settings and try again.
              </p>
            </div>
            <div className="rounded-2xl bg-muted/30 border border-card-border p-4 text-xs text-muted-foreground space-y-1 max-w-xs">
              <p className="font-medium text-foreground">How to enable:</p>
              <p>iOS: Settings → Safari → Camera → Allow</p>
              <p>Android: Site Settings → Camera → Allow</p>
            </div>
            <button
              onClick={() => setState("idle")}
              className="flex items-center gap-2 py-3 px-6 rounded-2xl border border-card-border text-sm hover:bg-muted/30 transition-colors"
              data-testid="button-retry-camera"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
