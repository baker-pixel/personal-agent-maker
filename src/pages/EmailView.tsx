// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Sparkles, Check, X, Edit2, Send, Mic, MicOff,
  Loader2, RefreshCw, Mail, AlertTriangle, MessageSquareReply,
  Eye, Newspaper, Clock, PenLine, Copy, Inbox, CheckCheck, ChevronDown, ChevronUp,
  FileText, Zap, CalendarClock, ListChecks, Search, Archive, Moon, SquarePen,
} from "lucide-react";
import { format, addHours, addDays, nextMonday, nextSaturday, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { ToastAction } from "@/components/ui/toast";
import { ComposeModal } from "@/components/ComposeModal";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import { Input } from "@/components/ui/input";
import { useAgent } from "@/contexts/AgentContext";
import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { GmailStatusBanner } from "@/components/GmailStatusBanner";
import { useDraftActions } from "@/hooks/useDraftActions";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { toast } from "@/hooks/use-toast";
import { useTriagedEmails, type TriagedEmail, type EmailCategory } from "@/hooks/useTriagedEmails";
import { SenderContactCard } from "@/components/SenderContactCard";

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  needs_reply: "Needs Reply",
  fyi: "FYI",
  newsletter: "Newsletter",
};

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS: Array<{
  id: EmailCategory;
  label: string;
  Icon: React.ElementType;
  color: string;
  bg: string;
  ring: string;
}> = [
  { id: "urgent",      label: "Urgent",      Icon: AlertTriangle,      color: "text-destructive",       bg: "bg-destructive/10",  ring: "ring-destructive/30" },
  { id: "needs_reply", label: "Needs Reply",  Icon: MessageSquareReply, color: "text-accent",            bg: "bg-accent/10",       ring: "ring-accent/30"      },
  { id: "fyi",         label: "FYI",          Icon: Eye,                color: "text-muted-foreground",  bg: "bg-muted",           ring: ""                    },
  { id: "newsletter",  label: "Newsletter",   Icon: Newspaper,          color: "text-muted-foreground",  bg: "bg-muted",           ring: ""                    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "";
  }
}

// ─── Email row ───────────────────────────────────────────────────────────────

function EmailRow({
  email,
  onClick,
}: {
  email: TriagedEmail;
  onClick: () => void;
}) {
  const displayName = email.from_name || email.from_address;

  return (
    <button
      onClick={onClick}
      className="w-full text-left glass-card rounded-xl p-4 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {email.is_unread && (
              <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
            )}
            <span className="text-sm font-semibold text-foreground truncate">{displayName}</span>
            <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1 ml-auto">
              <Clock className="w-3 h-3" />
              {timeAgo(email.received_at)}
            </span>
          </div>
          <p className="text-sm text-foreground truncate mb-1">{email.subject || "(no subject)"}</p>
          {email.ai_summary && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {email.ai_summary}
            </p>
          )}
        </div>
        {(email.priority_score ?? 0) >= 8 && (
          <span className="shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
            P{email.priority_score}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Replied section ─────────────────────────────────────────────────────────

function RepliedSection({ emails, onOpen }: { emails: TriagedEmail[]; onOpen: (e: TriagedEmail) => void }) {
  const [open, setOpen] = useState(false);
  if (emails.length === 0) return null;
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
      >
        <CheckCheck className="w-4 h-4 text-green-500" />
        <span className="font-medium">{emails.length} Replied</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2 opacity-60">
          {emails.map(email => (
            <EmailRow key={email.id} email={email} onClick={() => onOpen(email)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function EmailView() {
  const navigate = useNavigate();
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const { saveDraft, approveDraft } = useDraftActions();
  const annieChat = useAnnieChat(agentName);

  const gmailConnected = isConnected("gmail");
  const { integrationsLoading } = useIntegrations();
  const {
    emails: allEmails,
    byCategory,
    loading: dbLoading,
    refetch,
    updateEmailCategory,
    markEmailRead,
    removeEmailOptimistic,
    restoreEmailOptimistic,
    confirmArchive,
    snoozeEmail,
  } = useTriagedEmails();

  const [snoozeTarget, setSnoozeTarget] = useState<TriagedEmail | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<EmailCategory>("urgent");
  const [triaging, setTriaging] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<TriagedEmail | null>(null);
  const [emailBody, setEmailBody] = useState("");
  const [loadingBody, setLoadingBody] = useState(false);
  const [emailSummary, setEmailSummary] = useState<{ tldr: string; action_needed: string; deadline: string; key_points: string[]; tone: string } | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const archiveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleArchive = useCallback((email: TriagedEmail) => {
    if (selectedEmail?.id === email.id) setSelectedEmail(null);
    removeEmailOptimistic(email.id);
    toast({
      title: "Email archived",
      description: email.subject || email.from_name || "Removed from inbox",
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => {
            clearTimeout(archiveTimers.current[email.id]);
            delete archiveTimers.current[email.id];
            restoreEmailOptimistic(email);
          }}
        >
          Undo
        </ToastAction>
      ),
      duration: 5000,
    });
    archiveTimers.current[email.id] = setTimeout(() => {
      confirmArchive(email.id, email.nylas_message_id);
      delete archiveTimers.current[email.id];
    }, 5000);
  }, [selectedEmail, removeEmailOptimistic, restoreEmailOptimistic, confirmArchive]);

  const searchResults = searchQuery.trim().length > 1
    ? allEmails.filter(e => {
        const q = searchQuery.toLowerCase();
        return (
          e.subject?.toLowerCase().includes(q) ||
          e.from_name?.toLowerCase().includes(q) ||
          e.from_address?.toLowerCase().includes(q) ||
          e.ai_summary?.toLowerCase().includes(q)
        );
      })
    : [];

  const handleSummarize = useCallback(async () => {
    if (!selectedEmail || summarizing) return;
    setSummarizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-summarize", {
        body: {
          subject: selectedEmail.subject ?? "",
          from_name: selectedEmail.from_name,
          from_address: selectedEmail.from_address,
          body: emailBody || selectedEmail.ai_summary || "",
          ai_summary: selectedEmail.ai_summary,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setEmailSummary(data.summary);
    } catch (err: any) {
      toast({ title: "Summary failed", description: err?.message || "Could not summarize", variant: "destructive" });
    } finally {
      setSummarizing(false);
    }
  }, [selectedEmail, emailBody, summarizing]);

  // Draft-on-demand state
  const [draftPanelOpen, setDraftPanelOpen] = useState(false);
  const [draftInstructions, setDraftInstructions] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [generatedDraftBody, setGeneratedDraftBody] = useState<string | null>(null);
  const [draftSavedToInbox, setDraftSavedToInbox] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [sendingDraft, setSendingDraft] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);

  // Agent sheet
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const speech = useSpeechRecognition({
    onResult: (text) => setAgentInput((prev) => (prev ? prev + " " : "") + text),
  });

  // ── Run manual triage ────────────────────────────────────────────────────

  const runTriage = useCallback(async () => {
    setTriaging(true);
    setReconnectRequired(false);
    try {
      const { data, error } = await supabase.functions.invoke("email-triage", { body: { force: true } });
      if (error) throw error;
      if (data?.error) {
        if (data?.code === "RECONNECT_REQUIRED") { setReconnectRequired(true); return; }
        throw new Error(data.error);
      }
      setLastSyncAt(new Date());
      await refetch(); // Realtime will catch upserts, but explicit refetch ensures order
      if (data?.totalProcessed) {
        toast({ title: `${data.totalProcessed} emails triaged`, description: "Inbox updated" });
      }
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (msg.includes("expired") || msg.includes("reconnect")) { setReconnectRequired(true); return; }
      toast({ title: "Triage failed", description: msg || "Could not analyse emails", variant: "destructive" });
    } finally {
      setTriaging(false);
    }
  }, [refetch]);

  // Only auto-triage on first load if inbox is genuinely empty (no cached data)
  // — avoids unnecessary Nylas + Groq calls on every page visit
  useEffect(() => {
    if (!gmailConnected || dbLoading) return;
    const totalCached = Object.values(byCategory).reduce((s, arr) => s + arr.length, 0);
    if (totalCached === 0) runTriage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailConnected, dbLoading]);

  // ── Open email — fetch full body from Nylas ──────────────────────────────

  const openEmail = useCallback(async (email: TriagedEmail) => {
    setSelectedEmail(email);
    setEmailBody("");
    setLoadingBody(true);
    setEmailSummary(null);
    // Mark as read when user opens the email
    if (email.is_unread) markEmailRead(email.id, email.nylas_message_id);
    setDraftPanelOpen(false);
    setDraftInstructions("");
    setGeneratedDraftBody(null);
    setDraftSavedToInbox(false);
    setEditingDraft(false);
    setDraftText("");
    setCopiedDraft(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-fetch?messageId=${email.nylas_message_id}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const msgData = await resp.json();
      if (!msgData.error) {
        setEmailBody(msgData.body || "");
      }
    } catch (err) {
      console.error("Failed to fetch email body:", err);
    } finally {
      setLoadingBody(false);
    }
  }, []);

  // ── Generate draft ────────────────────────────────────────────────────────

  const handleGenerateDraft = useCallback(async (email: TriagedEmail) => {
    setGeneratingDraft(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-draft", {
        body: {
          nylas_message_id: email.nylas_message_id,
          thread_id: email.nylas_thread_id,
          from_address: email.from_name
            ? `${email.from_name} <${email.from_address}>`
            : email.from_address,
          from_name: email.from_name,
          subject: email.subject ?? "",
          body: emailBody || (email.ai_summary ?? ""),
          user_instructions: draftInstructions.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setGeneratedDraftBody(data.draft.body);
      setDraftText(data.draft.body);
      setDraftSavedToInbox(true);
    } catch (err: any) {
      toast({ title: "Draft failed", description: err?.message || "Could not generate draft", variant: "destructive" });
    } finally {
      setGeneratingDraft(false);
    }
  }, [emailBody, draftInstructions]);

  // ── Approve & send ────────────────────────────────────────────────────────

  const handleApproveSend = useCallback(async () => {
    if (!selectedEmail) return;
    setSendingDraft(true);
    try {
      const saved = await saveDraft({
        to_email: selectedEmail.from_address,
        to_name: selectedEmail.from_name ?? undefined,
        subject: selectedEmail.subject?.startsWith("Re:") ? selectedEmail.subject : `Re: ${selectedEmail.subject ?? ""}`,
        body: draftText,
        thread_id: selectedEmail.nylas_thread_id ?? undefined,
        in_reply_to: selectedEmail.nylas_message_id,
      });
      if (!saved) throw new Error("Could not save draft");
      const result = await approveDraft(saved.id);
      if (!result.success) throw new Error(result.error || "Send failed");
      toast({ title: "Email sent", description: `Reply sent to ${selectedEmail.from_name || selectedEmail.from_address}` });
      setSelectedEmail(null);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSendingDraft(false);
    }
  }, [selectedEmail, draftText, saveDraft, approveDraft]);

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    speech.stopListening();
    annieChat.send(agentInput.trim());
    setAgentInput("");
  };

  // ── Not connected ─────────────────────────────────────────────────────────

  if (integrationsLoading) return null;

  if (!gmailConnected) {
    return (
      <div className="min-h-screen bg-background flex flex-col pt-[var(--header-h)]">
        <div className="border-b bg-background sticky top-[var(--header-h)] z-50">
          <div className="container flex items-center h-12 px-3 gap-2">
            <button onClick={() => navigate("/dashboard")} className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="font-display font-semibold text-sm">Email</h1>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <Mail className="w-12 h-12 text-accent mx-auto mb-4" />
            <h2 className="font-display text-2xl font-semibold mb-2">Connect Gmail</h2>
            <p className="text-muted-foreground mb-4">Connect your Gmail in Settings to let {agentName} triage your inbox.</p>
            <Button onClick={() => navigate("/settings")} className="bg-accent text-accent-foreground">Go to Settings</Button>
          </div>
        </div>
      </div>
    );
  }

  const allInTab = byCategory[activeTab];
  const activeEmails = allInTab.filter(e => !e.replied_at);
  const repliedEmails = allInTab.filter(e => !!e.replied_at);
  const totalEmails = Object.values(byCategory).reduce((s, arr) => s + arr.length, 0);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col pt-[var(--header-h)]">

      {/* Single combined bar: back | tabs | refresh */}
      <div className="border-b bg-background sticky top-[var(--header-h)] z-50">
        <div className="container px-3 flex items-center gap-2 h-12">
          <button
            onClick={() => navigate("/dashboard")}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-none">
            {TABS.map(({ id, label, Icon, color, bg, ring }) => {
              const count = byCategory[id].filter(e => !e.replied_at).length;
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? `${bg} ${color} ring-1 ${ring}`
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline sm:inline">{label}</span>
                  {count > 0 && (
                    <span className={`text-[10px] font-bold px-1 rounded-full ${isActive ? "bg-background/50" : "bg-muted"}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setComposeOpen(true)}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Compose new email"
          >
            <SquarePen className="w-4 h-4" />
          </button>
          <button
            onClick={runTriage}
            disabled={triaging}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
            title={lastSyncAt ? `Last synced ${timeAgo(lastSyncAt.toISOString())} · tap to re-triage` : "Run triage"}
          >
            <RefreshCw className={`w-4 h-4 ${triaging ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Reconnect banner */}
        {reconnectRequired && (
          <div className="container px-4 pb-2">
            <GmailStatusBanner status="reconnect_required" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 container px-4 py-3 max-w-2xl mx-auto w-full space-y-3">

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search emails…"
            className="w-full pl-9 pr-9 py-2.5 text-sm bg-muted/30 border border-border/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-muted-foreground/50 transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search results */}
        {searchQuery.trim().length > 1 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {searchResults.length === 0 ? "No results" : `${searchResults.length} result${searchResults.length > 1 ? "s" : ""}`}
            </p>
            <div className="space-y-2">
              {searchResults.map(email => (
                <button
                  key={email.id}
                  onClick={() => openEmail(email)}
                  className="w-full text-left glass-card rounded-xl p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {email.is_unread && <span className="w-2 h-2 rounded-full bg-accent shrink-0" />}
                        <span className="text-sm font-semibold text-foreground truncate">{email.from_name || email.from_address}</span>
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-auto shrink-0">
                          {email.category.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-sm text-foreground truncate mb-1">{email.subject || "(no subject)"}</p>
                      {email.ai_summary && <p className="text-xs text-muted-foreground line-clamp-1">{email.ai_summary}</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Initial triage loading */}
        {(triaging && totalEmails === 0) || (dbLoading && totalEmails === 0) ? (
          <div className="glass-card rounded-2xl p-12 text-center mt-4" style={{ animation: "fade-up 0.3s ease-out both" }}>
            <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto mb-4" />
            <p className="text-foreground font-medium">{agentName} is reading your inbox…</p>
            <p className="text-sm text-muted-foreground mt-1">Analysing content, senders, and urgency</p>
          </div>
        ) : totalEmails === 0 ? (
          /* Empty — no emails triaged yet */
          <div className="glass-card rounded-2xl p-12 text-center mt-4">
            <Mail className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">No emails triaged yet</p>
            <p className="text-sm text-muted-foreground mb-4">{agentName} will analyse your inbox automatically</p>
            <Button onClick={runTriage} disabled={triaging} size="sm" className="bg-accent text-accent-foreground">
              {triaging ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Triaging…</> : <><Sparkles className="w-4 h-4 mr-2" />Run Triage Now</>}
            </Button>
          </div>
        ) : activeEmails.length === 0 ? (
          /* Empty category */
          <>
            <div className="glass-card rounded-2xl p-8 text-center mt-4">
              {(() => { const { Icon, color } = TABS.find(t => t.id === activeTab)!; return <Icon className={`w-8 h-8 mx-auto mb-3 ${color} opacity-40`} />; })()}
              <p className="text-muted-foreground">No {TABS.find(t => t.id === activeTab)?.label.toLowerCase()} emails</p>
            </div>
            <RepliedSection emails={repliedEmails} onOpen={openEmail} />
          </>
        ) : (
          /* Email list */
          <>
            <div className="space-y-2 mt-1" style={{ animation: "fade-up 0.2s ease-out both" }}>
              {activeEmails.map((email) => (
                <EmailRow key={email.id} email={email} onClick={() => openEmail(email)} />
              ))}
            </div>
            <RepliedSection emails={repliedEmails} onOpen={openEmail} />
          </>
        )}

        {/* Re-triage nudge while list is showing */}
        {totalEmails > 0 && lastSyncAt && (
          <p className="text-center text-[11px] text-muted-foreground/50 mt-6">
            Last triaged {timeAgo(lastSyncAt.toISOString())}
          </p>
        )}
      </div>

      {/* ── Email modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedEmail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/40 flex items-end sm:items-center justify-center"
            onClick={() => setSelectedEmail(null)}
          >
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="bg-background w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[88vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 space-y-4">

                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const tab = TABS.find(t => t.id === selectedEmail.category);
                      if (!tab) return null;
                      const { Icon, color, bg } = tab;
                      return (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${bg} ${color}`}>
                          <Icon className="w-3 h-3" />
                          {tab.label}
                        </span>
                      );
                    })()}
                    {(selectedEmail.priority_score ?? 0) >= 8 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                        P{selectedEmail.priority_score}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setSelectedEmail(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Meta */}
                <div>
                  <h2 className="font-display text-lg font-semibold mb-1 leading-snug">
                    {selectedEmail.subject || "(no subject)"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedEmail.from_name || selectedEmail.from_address}
                    {selectedEmail.from_name && ` <${selectedEmail.from_address}>`}
                    {" · "}
                    {timeAgo(selectedEmail.received_at)}
                  </p>
                  {selectedEmail.ai_reason && (
                    <div className="flex items-start gap-1.5 mt-2">
                      <Sparkles className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">{selectedEmail.ai_reason}</p>
                    </div>
                  )}
                  {/* Sender contact card */}
                  <div className="mt-3">
                    <SenderContactCard
                      fromAddress={selectedEmail.from_address}
                      fromName={selectedEmail.from_name}
                    />
                  </div>

                  {/* Move to category */}
                  {!selectedEmail.replied_at && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Move to</span>
                      {(["urgent", "needs_reply", "fyi", "newsletter"] as const)
                        .filter(c => c !== selectedEmail.category)
                        .map(c => {
                          const labels = CATEGORY_LABELS;
                          return (
                            <button
                              key={c}
                              onClick={() => {
                                updateEmailCategory(selectedEmail.id, c);
                                setSelectedEmail(null);
                              }}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                            >
                              {labels[c]}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Full body */}
                <div className="bg-card border rounded-xl p-4 min-h-[80px]">
                  {loadingBody ? (
                    <div className="flex items-center gap-2 justify-center py-6 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading…</span>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                      {emailBody || selectedEmail.ai_summary || "No preview available"}
                    </p>
                  )}
                </div>

                {/* Summarize — urgent + needs_reply only */}
                {(selectedEmail.category === "urgent" || selectedEmail.category === "needs_reply") && !selectedEmail.replied_at && (
                  <div>
                    {!emailSummary && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-muted-foreground hover:text-foreground"
                        disabled={summarizing || loadingBody}
                        onClick={handleSummarize}
                      >
                        {summarizing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                        {summarizing ? "Summarizing…" : "Summarize"}
                      </Button>
                    )}
                    {emailSummary && (
                      <div className="rounded-xl bg-muted/40 border border-border/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> AI Summary
                          </span>
                          <button onClick={() => setEmailSummary(null)} className="text-muted-foreground hover:text-foreground">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed">{emailSummary.tldr}</p>
                        {emailSummary.action_needed && (
                          <div className="flex items-start gap-2">
                            <Zap className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                            <p className="text-sm font-medium text-foreground">{emailSummary.action_needed}</p>
                          </div>
                        )}
                        {emailSummary.deadline && (
                          <div className="flex items-start gap-2">
                            <CalendarClock className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                            <p className="text-sm text-foreground">{emailSummary.deadline}</p>
                          </div>
                        )}
                        {emailSummary.key_points?.length > 0 && (
                          <div className="flex items-start gap-2">
                            <ListChecks className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                            <ul className="space-y-1">
                              {emailSummary.key_points.map((pt, i) => (
                                <li key={i} className="text-sm text-muted-foreground">• {pt}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Draft on demand */}
                {/* Snooze + Archive */}
                {!selectedEmail.replied_at && (
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setSnoozeTarget(selectedEmail)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border/40 text-muted-foreground hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-colors"
                    >
                      <Moon className="w-3.5 h-3.5" />
                      Snooze
                    </button>
                    <button
                      onClick={() => handleArchive(selectedEmail)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border/40 text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Archive
                    </button>
                  </div>
                )}

                <div className="border-t pt-4 space-y-3">
                  {!draftPanelOpen && !generatedDraftBody && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-accent/30 text-accent hover:bg-accent/10"
                      onClick={() => {
                        setDraftPanelOpen(true);
                        setTimeout(() => instructionsRef.current?.focus(), 50);
                      }}
                    >
                      <PenLine className="w-4 h-4 mr-2" />
                      Draft Reply with {agentName}
                    </Button>
                  )}

                  {draftPanelOpen && !generatedDraftBody && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        What should the reply focus on?{" "}
                        <span className="font-normal opacity-60">(optional)</span>
                      </p>
                      <Textarea
                        ref={instructionsRef}
                        value={draftInstructions}
                        onChange={(e) => setDraftInstructions(e.target.value)}
                        placeholder="e.g. Decline politely, ask for more details, confirm the meeting time…"
                        rows={2}
                        disabled={generatingDraft}
                        className="text-sm resize-none"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                          disabled={generatingDraft}
                          onClick={() => handleGenerateDraft(selectedEmail)}
                        >
                          {generatingDraft
                            ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Generating…</>
                            : <><Sparkles className="w-4 h-4 mr-1" />Generate Draft</>}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={generatingDraft}
                          onClick={() => { setDraftPanelOpen(false); setDraftInstructions(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {generatedDraftBody && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-[10px] font-bold">
                            {agentName.charAt(0)}
                          </div>
                          <span className="text-sm font-medium">{agentName}'s draft</span>
                        </div>
                        {draftSavedToInbox && (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Inbox className="w-3 h-3" />Saved to Approval Inbox
                          </span>
                        )}
                      </div>

                      {editingDraft ? (
                        <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} className="min-h-[120px] text-sm" />
                      ) : (
                        <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 whitespace-pre-line text-sm">{draftText}</div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        <Button onClick={handleApproveSend} disabled={sendingDraft}
                          className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90" size="sm">
                          {sendingDraft
                            ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Sending…</>
                            : <><Check className="w-4 h-4 mr-1" />Approve & Send</>}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingDraft(!editingDraft)}>
                          <Edit2 className="w-4 h-4 mr-1" /><span className="hidden sm:inline">{editingDraft ? "Preview" : "Edit"}</span>
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => {
                          navigator.clipboard.writeText(draftText);
                          setCopiedDraft(true);
                          setTimeout(() => setCopiedDraft(false), 2000);
                        }}>
                          {copiedDraft ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                          <span className="hidden sm:inline">{copiedDraft ? "Copied" : "Copy"}</span>
                        </Button>
                      </div>

                      <button className="text-[11px] text-muted-foreground hover:text-accent transition-colors"
                        onClick={() => {
                          setGeneratedDraftBody(null); setDraftSavedToInbox(false);
                          setDraftText(""); setEditingDraft(false);
                          setDraftPanelOpen(true);
                          setTimeout(() => instructionsRef.current?.focus(), 50);
                        }}>
                        Regenerate with different instructions
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Agent bottom sheet ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {agentSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/40 flex items-end justify-center"
            onClick={() => setAgentSheetOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background w-full max-w-lg rounded-t-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold">
                  {agentName.charAt(0)}
                </div>
                <p className="font-display font-semibold">What can I handle for you?</p>
              </div>
              {annieChat.messages.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-2 mb-3 px-1">
                  {annieChat.messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        msg.role === "user" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
                      }`}>{msg.text}</div>
                    </div>
                  ))}
                  {annieChat.thinking && (
                    <div className="flex justify-start">
                      <div className="bg-secondary text-secondary-foreground rounded-2xl px-3 py-2 text-sm">
                        <span className="animate-pulse">Thinking…</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Input value={agentInput} onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAgentSend()}
                  placeholder={`Tell ${agentName} what to do…`} className="flex-1" />
                <VoiceWaveform isActive={speech.isListening} />
                <button onClick={speech.toggleListening}
                  className={`p-2 rounded-lg transition-colors ${speech.isListening ? "text-destructive" : "text-muted-foreground hover:text-foreground"}`}>
                  {speech.isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button onClick={handleAgentSend}
                  className="p-2 rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Snooze sheet (inline — reuses same logic as EmailTriage) */}
      {snoozeTarget && (() => {
        function midnight(d: Date): Date { return setMilliseconds(setSeconds(setMinutes(setHours(new Date(d), 0), 0), 0), 0); }
        function at9am(d: Date): Date { return setMilliseconds(setSeconds(setMinutes(setHours(new Date(d), 9), 0), 0), 0); }
        function at5pm(d: Date): Date { return setMilliseconds(setSeconds(setMinutes(setHours(new Date(d), 17), 0), 0), 0); }
        const now = new Date();
        const opts: { label: string; sub: string; date: Date }[] = [
          { label: "In 1 hour", sub: format(addHours(now, 1), "h:mm a"), date: addHours(now, 1) },
          ...(now.getHours() < 15 ? [{ label: "Later today", sub: format(at5pm(now), "h:mm a"), date: at5pm(now) }] : []),
          { label: "Tomorrow morning", sub: format(at9am(addDays(midnight(now), 1)), "EEE, h:mm a"), date: at9am(addDays(midnight(now), 1)) },
          ...(now.getDay() !== 6 && now.getDay() !== 0 ? [{ label: "This weekend", sub: format(at9am(nextSaturday(now)), "EEE, MMM d"), date: at9am(nextSaturday(now)) }] : []),
          { label: "Next week", sub: format(at9am(now.getDay() === 1 ? addDays(now, 7) : nextMonday(now)), "EEE, MMM d"), date: at9am(now.getDay() === 1 ? addDays(now, 7) : nextMonday(now)) },
        ];
        return (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] bg-foreground/40 flex items-end sm:items-center justify-center" onClick={() => setSnoozeTarget(null)}>
              <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 320 }} className="bg-background w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><Moon className="w-4 h-4 text-accent" /><h3 className="font-display text-sm font-semibold">Snooze until…</h3></div>
                  <button onClick={() => setSnoozeTarget(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
                <p className="text-xs text-muted-foreground mb-3 truncate">{snoozeTarget.subject || snoozeTarget.from_name}</p>
                <div className="space-y-1">
                  {opts.map(opt => (
                    <button key={opt.label} onClick={() => { snoozeEmail(snoozeTarget, opt.date); setSnoozeTarget(null); toast({ title: "Email snoozed", description: `Wakes up ${opt.sub}`, duration: 3000 }); }} className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors text-left">
                      <div className="flex items-center gap-3"><Clock className="w-4 h-4 text-muted-foreground shrink-0" /><span className="text-sm font-medium text-foreground">{opt.label}</span></div>
                      <span className="text-xs text-muted-foreground">{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        );
      })()}

      {/* Compose modal */}
      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} />}

      {/* Floating agent button */}
      {!selectedEmail && !agentSheetOpen && (
        <button
          onClick={() => setAgentSheetOpen(true)}
          className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 flex items-center justify-center hover:scale-105 transition-transform z-40"
        >
          <span className="font-display font-bold text-lg">{agentName.charAt(0)}</span>
        </button>
      )}
    </div>
  );
}