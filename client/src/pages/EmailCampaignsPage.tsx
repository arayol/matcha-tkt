import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Mail, Upload, FileText, Send, CheckCircle2, XCircle, Loader2, Paperclip,
  RotateCcw, AlertTriangle, SpellCheck, Eye, X, Save, RefreshCw, Wand2, Reply,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { EmailCampaign, EmailCampaignRecipient, EmailContact } from "@shared/schema";

interface PageProps {
  dark: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
  user: { id: string; username: string; role: string };
}

interface ParsedRow {
  rowNumber: number;
  name: string;
  email: string;
  valid: boolean;
  reason?: string;
}

interface ParseResp {
  rows: ParsedRow[];
  validCount: number;
  invalidCount: number;
  totalRows: number;
  fileName: string;
  detectedNameColumn?: string;
  detectedEmailColumn?: string;
}

interface GrammarMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: string[];
  rule?: string;
  context?: string;
  field: "subject" | "body";
}

interface CampaignDetail {
  campaign: EmailCampaign;
  recipients: EmailCampaignRecipient[];
}

function NumberBadge({ n }: { n: number }) {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold">
      {n}
    </div>
  );
}

function SectionCard({
  number, title, meta, children, testId,
}: {
  number: number; title: string; meta?: React.ReactNode; children: React.ReactNode; testId?: string;
}) {
  return (
    <div className="rounded-3xl border border-card-border bg-card p-5 md:p-6 shadow-card" data-testid={testId}>
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <NumberBadge n={number} />
          <h2 className="text-base md:text-lg font-semibold truncate">{title}</h2>
          {meta && <div className="text-xs text-muted-foreground truncate">{meta}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + dt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(start: string | Date | null | undefined, end: string | Date | null | undefined) {
  if (!start) return "—";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((e - s) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function EmailCampaignsPage({ dark, toggleTheme, onLogout, user }: PageProps) {
  const { toast } = useToast();

  const [draftId, setDraftId] = useState<string | null>(null);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [senderName, setSenderName] = useState("Matcha On Ice Team");
  const [replyTo, setReplyTo] = useState("hello@matchaonice.com");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParseResp | null>(null);
  const [contactsImported, setContactsImported] = useState(false);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  // Reuse: previously imported contacts the admin can pick instead of re-uploading.
  const [selectedSavedIds, setSelectedSavedIds] = useState<Set<string>>(new Set());
  const [contactsMode, setContactsMode] = useState<"upload" | "saved">("upload");

  const [testEmail, setTestEmail] = useState("");

  const [grammarMatches, setGrammarMatches] = useState<GrammarMatch[] | null>(null);

  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [retryingRecipientId, setRetryingRecipientId] = useState<string | null>(null);
  const [checkingRepliesId, setCheckingRepliesId] = useState<string | null>(null);

  const { data: senderInfo } = useQuery<{ email: string }>({
    queryKey: ["/api/admin/email-campaigns/sender"],
    retry: false,
  });

  // Reply-to defaults to the brand inbox; admins can override. Backend warns
  // when reply-to doesn't match the connected Gmail mailbox (since reply
  // tracking polls the sending mailbox), but we let the admin choose.
  const replyToMismatch =
    !!senderInfo?.email &&
    !!replyTo &&
    replyTo.toLowerCase().trim() !== senderInfo.email.toLowerCase().trim();

  const { data: savedContacts = [] } = useQuery<EmailContact[]>({
    queryKey: ["/api/admin/email-contacts"],
  });

  const { data: campaigns = [] } = useQuery<EmailCampaign[]>({
    queryKey: ["/api/admin/email-campaigns"],
    refetchInterval: activeCampaignId ? 3000 : false,
  });

  const { data: activeDetail } = useQuery<CampaignDetail>({
    queryKey: ["/api/admin/email-campaigns", activeCampaignId],
    enabled: !!activeCampaignId,
    refetchInterval: (q) => (q.state.data?.campaign?.status === "sending" ? 2000 : false),
  });

  const uploadedValid = useMemo(() => parsed?.rows.filter((r) => r.valid) ?? [], [parsed]);
  const savedSelected = useMemo(
    () => savedContacts.filter((c) => selectedSavedIds.has(c.id)),
    [savedContacts, selectedSavedIds],
  );
  // Effective contacts for sending — depends on which mode the admin chose.
  const validContacts = useMemo(() => {
    if (contactsMode === "saved") return savedSelected.map((c) => ({ name: c.name, email: c.email }));
    return uploadedValid.map((c) => ({ name: c.name, email: c.email }));
  }, [contactsMode, uploadedValid, savedSelected]);

  // When using saved contacts, the "import" step is implicitly already done.
  const effectiveContactsImported = contactsMode === "saved" ? savedSelected.length > 0 : contactsImported;

  const handlePdfPick = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Please select a PDF file", variant: "destructive" });
      return;
    }
    setPdfFile(file);
  };

  const parseMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/email-campaigns/parse-contacts", {
        method: "POST", credentials: "include", body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || res.statusText);
      return json as ParseResp;
    },
    onSuccess: (data) => {
      setParsed(data);
      setContactsImported(false);
      toast({
        title: "Spreadsheet parsed",
        description: `${data.validCount} valid · ${data.invalidCount} invalid — confirm import to continue`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Could not parse file", description: err.message, variant: "destructive" });
    },
  });

  const importContactsMutation = useMutation({
    mutationFn: async () => {
      if (!parsed) throw new Error("No contacts to import");
      const valid = parsed.rows.filter((r) => r.valid);
      const res = await apiRequest("POST", "/api/admin/email-campaigns/import-contacts", {
        contacts: valid.map((r) => ({ name: r.name, email: r.email })),
        sourceFile: parsed.fileName,
      });
      return await res.json();
    },
    onSuccess: () => {
      setContactsImported(true);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-contacts"] });
      toast({ title: "Contacts imported", description: `${uploadedValid.length} contacts saved for reuse` });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  // English check operates on subject and body separately so offsets map cleanly to each field.
  const checkEnglishMutation = useMutation({
    mutationFn: async () => {
      const out: GrammarMatch[] = [];
      if (subject.trim()) {
        const r = await apiRequest("POST", "/api/admin/email-campaigns/check-english", { text: subject });
        const j = await r.json();
        for (const m of j.matches as GrammarMatch[]) out.push({ ...m, field: "subject" });
      }
      if (body.trim()) {
        const r = await apiRequest("POST", "/api/admin/email-campaigns/check-english", { text: body });
        const j = await r.json();
        for (const m of j.matches as GrammarMatch[]) out.push({ ...m, field: "body" });
      }
      return out;
    },
    onSuccess: (data) => {
      setGrammarMatches(data);
      toast({
        title: data.length === 0 ? "No issues found" : `${data.length} suggestion(s)`,
        description: data.length === 0 ? "Looks clean!" : "Apply individually or all at once.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "English check failed", description: err.message, variant: "destructive" });
    },
  });

  // Apply a single suggestion: replace the original substring at offset/length, then shift remaining offsets.
  function applySuggestion(idx: number, replacement: string) {
    if (!grammarMatches) return;
    const m = grammarMatches[idx];
    if (!m) return;
    const source = m.field === "subject" ? subject : body;
    const before = source.slice(0, m.offset);
    const after = source.slice(m.offset + m.length);
    const next = before + replacement + after;
    if (m.field === "subject") setSubject(next); else setBody(next);

    const delta = replacement.length - m.length;
    const updated = grammarMatches
      .map((other, i) => {
        if (i === idx) return null;
        if (other.field !== m.field) return other;
        if (other.offset >= m.offset + m.length) return { ...other, offset: other.offset + delta };
        if (other.offset + other.length <= m.offset) return other;
        return null; // overlap — drop
      })
      .filter(Boolean) as GrammarMatch[];
    setGrammarMatches(updated);
  }

  function applyAllSuggestions() {
    if (!grammarMatches || grammarMatches.length === 0) return;
    let nextSubject = subject;
    let nextBody = body;

    const groups: Record<"subject" | "body", GrammarMatch[]> = { subject: [], body: [] };
    for (const m of grammarMatches) {
      if (m.replacements[0]) groups[m.field].push(m);
    }
    for (const field of ["subject", "body"] as const) {
      const sorted = [...groups[field]].sort((a, b) => b.offset - a.offset);
      let text = field === "subject" ? nextSubject : nextBody;
      for (const m of sorted) {
        text = text.slice(0, m.offset) + m.replacements[0] + text.slice(m.offset + m.length);
      }
      if (field === "subject") nextSubject = text; else nextBody = text;
    }
    setSubject(nextSubject);
    setBody(nextBody);
    setGrammarMatches([]);
    toast({ title: "Applied all suggestions" });
  }

  const testSendMutation = useMutation({
    mutationFn: async () => {
      if (!testEmail) throw new Error("Enter a test email address");
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("senderName", senderName);
      fd.append("replyTo", replyTo);
      fd.append("testEmail", testEmail);
      if (pdfFile) fd.append("attachment", pdfFile);
      const res = await fetch("/api/admin/email-campaigns/test-send", {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error(await res.text() || res.statusText);
      return res.json();
    },
    onSuccess: () => toast({ title: "Test email sent", description: `Sent to ${testEmail}` }),
    onError: (err: Error) => toast({ title: "Test send failed", description: err.message, variant: "destructive" }),
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      if (draftId) fd.append("id", draftId);
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("senderName", senderName);
      fd.append("replyTo", replyTo);
      if (validContacts.length > 0) {
        fd.append("contacts", JSON.stringify(validContacts.map((c) => ({ name: c.name, email: c.email }))));
      }
      if (pdfFile) fd.append("attachment", pdfFile);
      const res = await fetch("/api/admin/email-campaigns/draft", {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      return (await res.json()) as { campaign: EmailCampaign };
    },
    onSuccess: (data) => {
      setDraftId(data.campaign.id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-campaigns"] });
      toast({ title: "Draft saved", description: "You can come back to finish this campaign later." });
    },
    onError: (err: Error) => toast({ title: "Could not save draft", description: err.message, variant: "destructive" }),
  });

  const sendCampaignMutation = useMutation({
    mutationFn: async () => {
      if (validContacts.length === 0) throw new Error("Import contacts first");
      if (!subject.trim() || !body.trim()) throw new Error("Subject and body are required");
      if (!pdfFile) throw new Error("Attach a PDF presentation deck before sending");
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("body", body);
      fd.append("senderName", senderName);
      fd.append("replyTo", replyTo);
      fd.append("contacts", JSON.stringify(validContacts.map((c) => ({ name: c.name, email: c.email }))));
      fd.append("attachment", pdfFile);
      const res = await fetch("/api/admin/email-campaigns/send", {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      return (await res.json()) as { campaign: EmailCampaign };
    },
    onSuccess: (data) => {
      setActiveCampaignId(data.campaign.id);
      setDraftId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-campaigns"] });
      toast({ title: "Campaign launched", description: `Sending to ${data.campaign.totalRecipients} recipients` });
    },
    onError: (err: Error) => toast({ title: "Failed to launch campaign", description: err.message, variant: "destructive" }),
  });

  const retryFailedMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/admin/email-campaigns/${id}/retry-failed`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-campaigns", activeCampaignId] });
      toast({ title: "Retrying all failed sends" });
    },
    onError: (err: Error) => toast({ title: "Retry failed", description: err.message, variant: "destructive" }),
  });

  const retryRecipientMutation = useMutation({
    mutationFn: async ({ campaignId, recipientId }: { campaignId: string; recipientId: string }) => {
      setRetryingRecipientId(recipientId);
      try {
        const res = await apiRequest("POST", `/api/admin/email-campaigns/${campaignId}/recipients/${recipientId}/retry`);
        return await res.json();
      } finally {
        setRetryingRecipientId(null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-campaigns", activeCampaignId] });
      toast({ title: "Recipient retried" });
    },
    onError: (err: Error) => toast({ title: "Retry failed", description: err.message, variant: "destructive" }),
  });

  const checkRepliesMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      setCheckingRepliesId(campaignId);
      try {
        const res = await apiRequest("POST", `/api/admin/email-campaigns/${campaignId}/check-replies`);
        return (await res.json()) as { newReplies: number; totalReplied: number };
      } finally {
        setCheckingRepliesId(null);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-campaigns", activeCampaignId] });
      toast({
        title: data.newReplies > 0 ? `${data.newReplies} new repl${data.newReplies === 1 ? "y" : "ies"}` : "No new replies",
        description: `${data.totalReplied} total replies tracked.`,
      });
    },
    onError: (err: Error) => toast({ title: "Could not check replies", description: err.message, variant: "destructive" }),
  });

  const failedRecipients = activeDetail?.recipients.filter((r) => r.status === "failed") ?? [];
  const showProgress = !!activeDetail;

  // Send button gating: contacts imported + body + subject + PDF attached
  const canSend =
    validContacts.length > 0 &&
    !!subject.trim() &&
    !!body.trim() &&
    !!pdfFile &&
    effectiveContactsImported;

  const sendDisabledReason = !subject.trim()
    ? "Add a subject"
    : !body.trim()
      ? "Add a body"
      : validContacts.length === 0
        ? contactsMode === "saved" ? "Pick at least one saved contact" : "Upload contacts"
        : !effectiveContactsImported
          ? "Confirm import to enable sending"
          : !pdfFile
            ? "Attach the PDF deck"
            : "";

  return (
    <AppLayout dark={dark} toggleTheme={toggleTheme} onLogout={onLogout} user={user} activePath="/admin/email-campaigns" data-testid="email-campaigns-page">
      <div className="space-y-5">
        <div className="hidden md:block">
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">Email Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send invitation emails with PDF presentation deck to vendors and brands
            {senderInfo?.email ? ` · sending from ${senderInfo.email}` : ""}
          </p>
        </div>

        {/* 1. Compose campaign */}
        <SectionCard number={1} title="Compose campaign" testId="card-compose">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="senderName" className="text-xs text-muted-foreground">Sender name</Label>
              <Input id="senderName" value={senderName} onChange={(e) => setSenderName(e.target.value)} className="mt-1.5" data-testid="input-sender-name" />
            </div>
            <div>
              <Label htmlFor="replyTo" className="text-xs text-muted-foreground">Reply-to address</Label>
              <Input id="replyTo" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className="mt-1.5" data-testid="input-reply-to" />
              {replyToMismatch && senderInfo?.email && (
                <p className="text-[11px] text-amber-600 mt-1.5" data-testid="text-reply-to-warning">
                  Replies will land in <span className="font-mono">{replyTo}</span>, which is not the connected mailbox ({senderInfo.email}). Reply tracking only works when reply-to matches the sending mailbox.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="subject" className="text-xs text-muted-foreground">Subject</Label>
            <Input
              id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="{{name}}, let's bring Matcha On Ice to your audience"
              className="mt-1.5" data-testid="input-subject"
            />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="body" className="text-xs text-muted-foreground">Body</Label>
              <span className="text-[10px] text-muted-foreground">
                Use <code className="px-1 py-0.5 rounded bg-muted">{`{{name}}`}</code> to personalize
              </span>
            </div>
            <Textarea
              id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={7}
              placeholder={"Hi {{name}},\n\nWe're putting together a curated list of beverage brands for our 2026 Matcha On Ice circuit in San Diego. Attached is our deck — would love your thoughts on a partnership."}
              className="mt-1.5 font-sans"
              data-testid="input-body"
            />

            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => checkEnglishMutation.mutate()}
                disabled={checkEnglishMutation.isPending || (!subject && !body)}
                data-testid="button-check-english">
                {checkEnglishMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <SpellCheck className="h-3.5 w-3.5 mr-1.5" />}
                Check English (US)
              </Button>
              {grammarMatches !== null && (
                <span className="text-xs text-muted-foreground" data-testid="text-grammar-summary">
                  {grammarMatches.length === 0 ? "No issues found" : `${grammarMatches.length} suggestion(s)`}
                </span>
              )}
              {grammarMatches && grammarMatches.length > 0 && (
                <Button size="sm" variant="secondary" onClick={applyAllSuggestions} data-testid="button-apply-all">
                  <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Apply all
                </Button>
              )}
            </div>

            {grammarMatches && grammarMatches.length > 0 && (
              <div className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2 max-h-72 overflow-y-auto">
                {grammarMatches.map((m, i) => (
                  <div key={`${m.field}-${m.offset}-${i}`} className="text-xs flex items-start justify-between gap-3" data-testid={`grammar-match-${i}`}>
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-amber-900 dark:text-amber-200">
                          <Badge variant="outline" className="mr-1.5 border-amber-500/40 text-amber-700 dark:text-amber-300 text-[10px] py-0">
                            {m.field}
                          </Badge>
                          {m.message}
                        </p>
                        {m.context && <p className="text-amber-800/70 dark:text-amber-300/70 mt-0.5">…{m.context}…</p>}
                      </div>
                    </div>
                    {m.replacements.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap shrink-0 max-w-[40%] justify-end">
                        {m.replacements.slice(0, 3).map((rep, j) => (
                          <Button
                            key={j}
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px]"
                            onClick={() => applySuggestion(i, rep)}
                            data-testid={`button-apply-${i}-${j}`}
                          >
                            {rep || "(remove)"}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PDF attachment slot */}
          <div className="mt-4">
            <input
              ref={pdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfPick(f); e.target.value = ""; }}
              data-testid="input-pdf"
            />
            {pdfFile ? (
              <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-muted/40 px-4 py-3" data-testid="pdf-attached">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 text-rose-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(pdfFile.size)} · attached to every email</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setPdfFile(null)} data-testid="button-remove-pdf">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                onClick={() => pdfInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-400/50 bg-amber-50/40 dark:bg-amber-950/10 px-4 py-5 text-sm text-amber-700 dark:text-amber-300 hover:border-amber-500 transition-colors"
                data-testid="button-attach-pdf"
              >
                <Paperclip className="h-4 w-4" />
                Attach PDF presentation deck (required)
              </button>
            )}
          </div>
        </SectionCard>

        {/* 2. Import contacts */}
        <SectionCard
          number={2}
          title="Choose contacts"
          meta={
            contactsMode === "saved"
              ? `· ${savedSelected.length} of ${savedContacts.length} saved selected`
              : parsed
                ? `· ${parsed.validCount} valid · ${parsed.invalidCount} invalid${contactsImported ? " · imported" : " · not yet confirmed"}`
                : undefined
          }
          testId="card-contacts"
        >
          <div className="mb-4 inline-flex rounded-full border border-card-border bg-muted/40 p-1 text-xs">
            <button
              onClick={() => setContactsMode("upload")}
              className={`px-3 py-1.5 rounded-full transition-colors ${contactsMode === "upload" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-mode-upload"
            >
              Upload new (.xlsx)
            </button>
            <button
              onClick={() => setContactsMode("saved")}
              className={`px-3 py-1.5 rounded-full transition-colors ${contactsMode === "saved" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-mode-saved"
            >
              Reuse saved ({savedContacts.length})
            </button>
          </div>

          {contactsMode === "saved" ? (
            savedContacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-card-border px-4 py-10 text-center text-sm text-muted-foreground">
                No saved contacts yet. Upload an .xlsx file and confirm import to build your reusable list.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Button
                    size="sm" variant="outline"
                    onClick={() => setSelectedSavedIds(new Set(savedContacts.map((c) => c.id)))}
                    data-testid="button-select-all-saved"
                  >Select all</Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => setSelectedSavedIds(new Set())}
                    data-testid="button-clear-saved"
                  >Clear</Button>
                  <span>{savedSelected.length} selected</span>
                </div>
                <div className="rounded-2xl border border-card-border overflow-hidden max-h-80 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {savedContacts.map((c) => (
                        <TableRow key={c.id} data-testid={`row-saved-${c.id}`}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedSavedIds.has(c.id)}
                              onChange={(e) => {
                                setSelectedSavedIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(c.id); else next.delete(c.id);
                                  return next;
                                });
                              }}
                              data-testid={`checkbox-saved-${c.id}`}
                            />
                          </TableCell>
                          <TableCell className="text-sm">{c.name}</TableCell>
                          <TableCell className="text-xs font-mono">{c.email}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.sourceFile || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          ) : (
            <>
          <input
            ref={xlsxInputRef} type="file" accept=".xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) parseMutation.mutate(f); e.target.value = ""; }}
            data-testid="input-xlsx"
          />

          {!parsed ? (
            <button
              onClick={() => xlsxInputRef.current?.click()}
              disabled={parseMutation.isPending}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-card-border px-4 py-10 text-sm text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
              data-testid="button-upload-xlsx"
            >
              {parseMutation.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              Drop or browse an Excel file (.xlsx) — first row must include columns: name, email
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-card-border bg-muted/30 px-4 py-3 gap-2 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" data-testid="text-contacts-filename">{parsed.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsed.validCount} valid · {parsed.invalidCount} invalid · columns: {parsed.detectedNameColumn || "name"} / {parsed.detectedEmailColumn || "email"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => xlsxInputRef.current?.click()} data-testid="button-replace-contacts">
                    <Upload className="h-3.5 w-3.5 mr-1.5" /> Replace
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => importContactsMutation.mutate()}
                    disabled={importContactsMutation.isPending || contactsImported || uploadedValid.length === 0}
                    data-testid="button-confirm-import"
                  >
                    {importContactsMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                    {contactsImported ? "Imported" : `Confirm import (${uploadedValid.length})`}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-card-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.slice(0, 8).map((r) => (
                      <TableRow key={r.rowNumber} data-testid={`row-contact-${r.rowNumber}`}>
                        <TableCell className="text-xs text-muted-foreground">{r.rowNumber - 1}</TableCell>
                        <TableCell className="text-sm">{r.name || "—"}</TableCell>
                        <TableCell className="text-sm font-mono text-xs">{r.email || "—"}</TableCell>
                        <TableCell className="text-right">
                          {r.valid ? (
                            <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15" data-testid={`badge-valid-${r.rowNumber}`}>Valid</Badge>
                          ) : (
                            <Badge variant="outline" className="border-rose-500/40 text-rose-500" data-testid={`badge-invalid-${r.rowNumber}`}>{r.reason || "Invalid"}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {parsed.rows.length > 8 && (
                  <div className="text-center text-xs text-muted-foreground py-3 border-t border-card-border">
                    + {parsed.rows.length - 8} more contacts
                  </div>
                )}
              </div>
            </div>
          )}
            </>
          )}
        </SectionCard>

        {/* 3. Test & send */}
        <SectionCard number={3} title="Test & send" testId="card-test-send">
          <div className="rounded-2xl border border-card-border bg-muted/30 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                Send a test to your own inbox before launching to {validContacts.length} contact{validContacts.length === 1 ? "" : "s"}.
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              <Input
                type="email" placeholder="your@email.com" value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)} className="flex-1"
                data-testid="input-test-email"
              />
              <Button
                variant="outline" onClick={() => testSendMutation.mutate()}
                disabled={testSendMutation.isPending || !testEmail || !subject || !body || !pdfFile}
                title={!pdfFile ? "Attach the PDF deck first" : undefined}
                data-testid="button-send-test"
              >
                {testSendMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Send test
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2 flex-wrap">
            {sendDisabledReason && (
              <span className="text-xs text-muted-foreground italic mr-auto" data-testid="text-send-disabled-reason">
                {sendDisabledReason}
              </span>
            )}
            <Button
              variant="outline"
              onClick={() => saveDraftMutation.mutate()}
              disabled={saveDraftMutation.isPending || (!subject.trim() && !body.trim())}
              data-testid="button-save-draft"
            >
              {saveDraftMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              {draftId ? "Update draft" : "Save draft"}
            </Button>
            <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  disabled={sendCampaignMutation.isPending || !canSend}
                  data-testid="button-send-campaign"
                >
                  {sendCampaignMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                  Send campaign · {validContacts.length}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="dialog-confirm-send">
                <AlertDialogHeader>
                  <AlertDialogTitle>Send this campaign?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will email <strong>{validContacts.length}</strong> {validContacts.length === 1 ? "recipient" : "recipients"} from <strong>{senderInfo?.email || "your connected mailbox"}</strong>.
                    Sending is sequential (about one email every 350ms) and cannot be cancelled once started.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-send">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { setConfirmSendOpen(false); sendCampaignMutation.mutate(); }}
                    data-testid="button-confirm-send"
                  >
                    Yes, send now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </SectionCard>

        {/* 4. Sending in progress */}
        {showProgress && activeDetail && (
          <SectionCard
            number={4}
            title="Sending in progress"
            meta={`· ${activeDetail.campaign.sentCount} of ${activeDetail.campaign.totalRecipients} sent · ${formatElapsed(activeDetail.campaign.startedAt, activeDetail.campaign.completedAt)} elapsed`}
            testId="card-progress"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-2xl border border-card-border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold" data-testid="stat-total">{activeDetail.campaign.totalRecipients}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-xs text-emerald-500">Sent</p>
                <p className="text-2xl font-bold" data-testid="stat-sent">{activeDetail.campaign.sentCount}</p>
              </div>
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
                <p className="text-xs text-rose-500">Failed</p>
                <p className="text-2xl font-bold" data-testid="stat-failed">{activeDetail.campaign.failedCount}</p>
              </div>
              <div className="rounded-2xl border border-card-border bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold" data-testid="stat-pending">
                  {activeDetail.campaign.totalRecipients - activeDetail.campaign.sentCount - activeDetail.campaign.failedCount}
                </p>
              </div>
            </div>

            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${activeDetail.campaign.totalRecipients > 0
                    ? Math.round(((activeDetail.campaign.sentCount + activeDetail.campaign.failedCount) / activeDetail.campaign.totalRecipients) * 100)
                    : 0}%`,
                }}
              />
            </div>

            <div className="rounded-2xl border border-card-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sent at</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeDetail.recipients.slice(0, 25).map((r) => (
                    <TableRow key={r.id} data-testid={`progress-row-${r.id}`}>
                      <TableCell className="text-sm">{r.name}</TableCell>
                      <TableCell className="text-xs font-mono">{r.email}</TableCell>
                      <TableCell>
                        {r.status === "sent" && (
                          <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Sent
                          </Badge>
                        )}
                        {r.status === "failed" && (
                          <Badge variant="outline" className="border-rose-500/40 text-rose-500" title={r.error || ""}>
                            <XCircle className="h-3 w-3 mr-1" /> Failed
                          </Badge>
                        )}
                        {r.status === "pending" && (
                          <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                        )}
                        {r.repliedAt && (
                          <Badge className="ml-1 bg-blue-500/15 text-blue-500 hover:bg-blue-500/15">
                            <Reply className="h-3 w-3 mr-1" /> Replied
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {r.sentAt ? new Date(r.sentAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === "failed" && activeDetail.campaign.status !== "sending" && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => retryRecipientMutation.mutate({ campaignId: activeDetail.campaign.id, recipientId: r.id })}
                            disabled={retryingRecipientId === r.id}
                            data-testid={`button-retry-recipient-${r.id}`}
                          >
                            {retryingRecipientId === r.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry</>}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                Showing {Math.min(25, activeDetail.recipients.length)} of {activeDetail.recipients.length}
                {activeDetail.campaign.status === "sending" ? " · auto-refreshing every 2s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="outline"
                  onClick={() => checkRepliesMutation.mutate(activeDetail.campaign.id)}
                  disabled={checkingRepliesId === activeDetail.campaign.id || activeDetail.campaign.sentCount === 0}
                  data-testid="button-check-replies"
                >
                  {checkingRepliesId === activeDetail.campaign.id
                    ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Check replies
                </Button>
                {failedRecipients.length > 0 && activeDetail.campaign.status !== "sending" && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => retryFailedMutation.mutate(activeDetail.campaign.id)}
                    disabled={retryFailedMutation.isPending}
                    data-testid="button-retry-failed"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Retry all failed ({failedRecipients.length})
                  </Button>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {/* 5. Campaign history */}
        <HistoryCard
          campaigns={campaigns}
          checkingRepliesId={checkingRepliesId}
          onCheckReplies={(id) => checkRepliesMutation.mutate(id)}
          onView={(id) => setActiveCampaignId(id)}
        />
      </div>
    </AppLayout>
  );
}

function HistoryCard({
  campaigns, checkingRepliesId, onCheckReplies, onView,
}: {
  campaigns: EmailCampaign[];
  checkingRepliesId: string | null;
  onCheckReplies: (id: string) => void;
  onView: (id: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? campaigns : campaigns.slice(0, 5);

  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <SectionCard
      number={5}
      title="Campaign history"
      meta={`· ${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}
      testId="card-history"
    >
      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
          <Mail className="h-8 w-8 opacity-30" />
          <p className="text-sm" data-testid="text-no-campaigns">No campaigns yet</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-card-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Replied</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => {
                  const sentPct = pct(c.sentCount, c.totalRecipients);
                  const failedPct = pct(c.failedCount, c.totalRecipients);
                  const repliedPct = pct(c.repliedCount, c.sentCount || c.totalRecipients);
                  return (
                    <TableRow key={c.id} data-testid={`history-row-${c.id}`}>
                      <TableCell>
                        <div className="text-sm font-medium flex items-center gap-2">
                          {c.subject || <span className="italic text-muted-foreground">(no subject)</span>}
                          {c.status === "draft" && <Badge variant="outline" className="text-[10px]">Draft</Badge>}
                          {c.status === "sending" && <Badge className="bg-primary/15 text-primary text-[10px]">Sending</Badge>}
                          {c.status === "completed" && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500">Completed</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{c.totalRecipients}</TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm text-emerald-500 font-medium">{c.sentCount}</div>
                        <div className="text-[10px] text-emerald-500/70">{sentPct}%</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm text-rose-500 font-medium">{c.failedCount}</div>
                        <div className="text-[10px] text-rose-500/70">{failedPct}%</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm text-blue-500 font-medium">{c.repliedCount}</div>
                        <div className="text-[10px] text-blue-500/70">{repliedPct}% of sent</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {c.sentCount > 0 && (
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => onCheckReplies(c.id)}
                              disabled={checkingRepliesId === c.id}
                              data-testid={`button-history-check-replies-${c.id}`}
                              title="Check Gmail inbox for replies"
                            >
                              {checkingRepliesId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => onView(c.id)} data-testid={`button-view-${c.id}`}>
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {campaigns.length > 5 && (
            <div className="mt-3 flex justify-center">
              <Button
                size="sm" variant="outline"
                onClick={() => setShowAll((v) => !v)}
                data-testid="button-toggle-all-campaigns"
              >
                {showAll ? "Show recent only" : `View all (${campaigns.length})`}
              </Button>
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground mt-3">
        * Reply tracking polls the Gmail inbox associated with the sending account; only direct messages from a recipient address received after the campaign launched are counted. Auto-replies and bounces are excluded.
      </p>
    </SectionCard>
  );
}
