import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CheckCircle2, XCircle, Clock, MapPin, Calendar, Timer, User, Ticket, Download, Share2 } from "lucide-react";

export default function TicketPage() {
  const params = useParams<{ slug: string }>();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, error } = useQuery<{ ticket: any; event: any }>({
    queryKey: ["/api/ticket", params.slug],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="loading-state">
        <div className="animate-pulse text-muted-foreground">Loading ticket...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="error-state">
        <div className="rounded-3xl border border-destructive/30 bg-card p-8 shadow-card text-center max-w-md">
          <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-semibold">Ticket Not Found</h1>
          <p className="text-muted-foreground mt-2">This ticket link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const { ticket, event } = data;

  const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    valid: { icon: CheckCircle2, color: "text-status-online", bg: "bg-green-50 dark:bg-green-950/30", label: "Valid" },
    used: { icon: Clock, color: "text-status-away", bg: "bg-yellow-50 dark:bg-yellow-950/30", label: "Used" },
    cancelled: { icon: XCircle, color: "text-status-busy", bg: "bg-red-50 dark:bg-red-950/30", label: "Cancelled" },
  };

  const status = statusConfig[ticket.status] || statusConfig.valid;
  const StatusIcon = status.icon;

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      window.open(`/api/ticket/${params.slug}/pdf`, "_blank");
    } finally {
      setTimeout(() => setDownloading(false), 1500);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `${event?.name || "Event Ticket"} — Matcha On Ice`,
      text: `My ticket for ${event?.name || "the event"}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (_) {}
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="ticket-page">
      <div className="w-full max-w-md space-y-4">
        <div className="rounded-3xl border border-card-border bg-card shadow-card overflow-hidden">

          <div className="bg-primary p-6 text-center">
            <Ticket className="h-8 w-8 text-primary-foreground mx-auto mb-2" />
            <h1 className="text-xl font-semibold text-primary-foreground" data-testid="text-event-name">
              {event?.name || "Event Ticket"}
            </h1>
            <p className="text-primary-foreground/80 text-sm mt-1">Matcha On Ice · San Diego, CA</p>
          </div>

          <div className="p-6 space-y-5">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${status.bg}`}>
              <StatusIcon className={`h-5 w-5 ${status.color}`} />
              <span className={`font-semibold ${status.color}`} data-testid="text-ticket-status">{status.label}</span>
            </div>

            {ticket.qrCode && ticket.status === "valid" && (
              <div className="flex justify-center" data-testid="qr-code">
                <img
                  src={ticket.qrCode}
                  alt="Ticket QR Code"
                  className="w-72 h-72 rounded-2xl border border-card-border"
                />
              </div>
            )}

            {ticket.status === "used" && (
              <div className="text-center py-4">
                <Clock className="h-16 w-16 text-status-away mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">
                  Used on {ticket.usedAt ? new Date(ticket.usedAt).toLocaleString() : "unknown"}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Name</span>
                <span className="ml-auto font-medium" data-testid="text-purchaser-name">{ticket.purchaserName}</span>
              </div>

              {event && (
                <>
                  <div className="h-px border-t border-dashed border-border" />
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Date</span>
                    <span className="ml-auto font-medium" data-testid="text-event-date">{event.date}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Timer className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Time</span>
                    <span className="ml-auto font-medium" data-testid="text-event-time">{event.time}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-muted-foreground">Location</span>
                    <span className="ml-auto font-medium" data-testid="text-event-location">{event.location}</span>
                  </div>
                </>
              )}

              <div className="h-px border-t border-dashed border-border" />
              <div className="flex items-center gap-3 text-sm">
                <Ticket className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">Type</span>
                <span className="ml-auto px-3 py-1 rounded-xl bg-primary/10 text-primary text-xs font-medium" data-testid="text-ticket-type">
                  {ticket.ticketType}
                </span>
              </div>
            </div>
          </div>

          {ticket.status === "valid" && (
            <div className="px-6 pb-6 space-y-3">
              <div className="h-px border-t border-dashed border-border mb-4" />

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleDownloadPDF}
                  disabled={downloading}
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-2xl font-medium text-sm shadow-soft hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-70"
                  data-testid="button-download-pdf"
                >
                  <Download className="h-4 w-4" />
                  {downloading ? "Opening..." : "Download PDF"}
                </button>

                <button
                  onClick={handleShare}
                  className="flex items-center justify-center gap-2 border border-card-border bg-card text-foreground py-3 rounded-2xl font-medium text-sm hover:bg-muted/30 active:scale-95 transition-all"
                  data-testid="button-share"
                >
                  <Share2 className="h-4 w-4" />
                  {copied ? "Copied!" : "Share"}
                </button>
              </div>

              {copied && (
                <p className="text-center text-xs text-status-online" data-testid="text-copied-feedback">
                  Link copied to clipboard!
                </p>
              )}
            </div>
          )}

          <div className="px-6 pb-6">
            <p className="text-center text-xs text-muted-foreground">
              Ticket ID: {ticket.id.slice(0, 8).toUpperCase()}...
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-muted-foreground">Matcha On Ice &middot; San Diego, CA</p>
        </div>
      </div>
    </div>
  );
}
