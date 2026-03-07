import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Gift, Send, AlertCircle, ChevronDown, CheckCircle2, Moon, Sun } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EventData {
  id: string;
  name: string;
  date: string;
  time: string;
}

const TICKET_TYPES = ["Members", "General", "VIP", "Staff"];

export default function CourtesyPage({ dark, toggleTheme }: { dark: boolean; toggleTheme: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ eventId: "", name: "", email: "", ticketType: "Members" });
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: eventList } = useQuery<EventData[]>({ queryKey: ["/api/events"] });

  const mutation = useMutation({
    mutationFn: (body: { eventId: string; purchaserName: string; purchaserEmail: string; ticketType: string }) =>
      apiRequest("POST", "/api/tickets/courtesy", body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/scanner/stats"] });
      setForm({ eventId: "", name: "", email: "", ticketType: "Members" });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      toast({ title: "Courtesy ticket created", description: "The ticket has been sent to the recipient." });
    },
    onError: () => {
      toast({ title: "Failed to create ticket", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!form.eventId || !form.name || !form.email) return;
    mutation.mutate({
      eventId: form.eventId,
      purchaserName: form.name,
      purchaserEmail: form.email,
      ticketType: form.ticketType,
    });
  };

  const inputClass = `w-full px-3 py-3 rounded-xl text-sm outline-none transition-colors ${
    dark
      ? "bg-[#161616] border border-[#222] text-white placeholder-gray-600 focus:border-primary"
      : "bg-muted/40 border border-card-border placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
  }`;

  return (
    <div className={`min-h-screen flex flex-col ${dark ? "bg-[#0a0a0a] text-white" : "bg-background text-foreground"}`} data-testid="courtesy-page">
      <header className={`flex items-center justify-between px-4 py-3 border-b ${dark ? "bg-[#111] border-[#222]" : "bg-card border-card-border"}`}>
        <Link href="/" className={`flex items-center gap-1.5 text-sm ${dark ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-foreground"} transition-colors`} data-testid="link-back">
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </Link>
        <div className="flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-base">Courtesy Ticket</h1>
        </div>
        <button onClick={toggleTheme} className={`p-2 rounded-xl ${dark ? "text-gray-400 hover:text-white" : "text-muted-foreground hover:text-foreground"}`} data-testid="button-theme-courtesy">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <main className="flex-1 p-4 space-y-4 max-w-lg mx-auto w-full">
        {showSuccess && (
          <div className={`rounded-2xl p-4 flex items-center gap-3 ${dark ? "bg-green-950/40 border border-green-800/50" : "bg-green-50 border border-green-200"}`} data-testid="courtesy-success">
            <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-500">Ticket Created</p>
              <p className={`text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>Email sent to the recipient.</p>
            </div>
          </div>
        )}

        <div className={`rounded-2xl p-5 space-y-4 ${dark ? "bg-[#111] border border-[#222]" : "bg-card border border-card-border shadow-card"}`}>
          <div>
            <label className={`text-xs font-medium mb-1.5 block ${dark ? "text-gray-400" : "text-muted-foreground"}`}>Event</label>
            <div className="relative">
              <select
                value={form.eventId}
                onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))}
                className={`${inputClass} appearance-none pr-8`}
                data-testid="select-courtesy-event"
              >
                <option value="">Select event...</option>
                {(eventList || []).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${dark ? "text-gray-600" : "text-muted-foreground"}`} />
            </div>
          </div>

          <div>
            <label className={`text-xs font-medium mb-1.5 block ${dark ? "text-gray-400" : "text-muted-foreground"}`}>Recipient Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
              className={inputClass}
              data-testid="input-courtesy-name"
            />
          </div>

          <div>
            <label className={`text-xs font-medium mb-1.5 block ${dark ? "text-gray-400" : "text-muted-foreground"}`}>Recipient Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="email@example.com"
              className={inputClass}
              data-testid="input-courtesy-email"
            />
          </div>

          <div>
            <label className={`text-xs font-medium mb-1.5 block ${dark ? "text-gray-400" : "text-muted-foreground"}`}>Ticket Type</label>
            <div className="relative">
              <select
                value={form.ticketType}
                onChange={(e) => setForm((f) => ({ ...f, ticketType: e.target.value }))}
                className={`${inputClass} appearance-none pr-8`}
                data-testid="select-courtesy-type"
              >
                {TICKET_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${dark ? "text-gray-600" : "text-muted-foreground"}`} />
            </div>
          </div>

          {mutation.isError && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-xl" data-testid="text-courtesy-error">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              Failed to create ticket. Check all fields.
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || !form.eventId || !form.name || !form.email}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3.5 rounded-2xl font-semibold text-sm shadow-soft hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            data-testid="button-create-courtesy"
          >
            <Send className="h-4 w-4" />
            {mutation.isPending ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </main>
    </div>
  );
}
