import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useDraftActions, type DraftAction } from "@/hooks/useDraftActions";
import { toast } from "@/hooks/use-toast";
import {
  Check,
  X,
  Mail,
  Clock,
  Plug,
  Loader2,
  Send,
  SendHorizonal,
  Inbox,
  History,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Pencil,
  Save,
} from "lucide-react";

type Tab = "pending" | "sent" | "history";

interface GmailSentEmail {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
}

const statusConfig: Record<string, { icon: React.ElementType; label: string; className: string }> = {
  sent: { icon: CheckCircle2, label: "Sent", className: "text-success bg-success/10" },
  rejected: { icon: XCircle, label: "Dismissed", className: "text-muted-foreground bg-muted" },
  failed: { icon: AlertCircle, label: "Failed", className: "text-destructive bg-destructive/10" },
};

export const ApprovalInbox = () => {
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const { drafts, sentDrafts, loading, loadingSent, approveDraft, rejectDraft, fetchSentDrafts, updateDraft } = useDraftActions();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>("pending");
  const [hasFetchedHistory, setHasFetchedHistory] = useState(false);
  const [sentEmails, setSentEmails] = useState<GmailSentEmail[]>([]);
  const [loadingSentEmails, setLoadingSentEmails] = useState(false);
  const [hasFetchedSent, setHasFetchedSent] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const gmailConnected = isConnected("gmail");

  const fetchSentEmails = useCallback(async () => {
    setLoadingSentEmails(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-fetch?q=${encodeURIComponent("is:sent")}&maxResults=20`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const result = await res.json();
      if (result.emails) setSentEmails(result.emails);
    } catch (e) {
      console.error("Failed to fetch sent emails", e);
    } finally {
      setLoadingSentEmails(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "history" && !hasFetchedHistory) {
      fetchSentDrafts();
      setHasFetchedHistory(true);
    }
    if (tab === "sent" && !hasFetchedSent) {
      fetchSentEmails();
      setHasFetchedSent(true);
    }
  }, [tab, hasFetchedHistory, fetchSentDrafts, hasFetchedSent, fetchSentEmails]);

  const handleApprove = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    const result = await approveDraft(id);
    setProcessingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (result.success) {
      toast({ title: "Email sent", description: "Your approved draft has been sent via Gmail." });
      // Refresh history if already loaded
      if (hasFetchedHistory) fetchSentDrafts();
    } else {
      toast({ title: "Failed to send", description: result.error, variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    await rejectDraft(id);
    toast({ title: "Draft dismissed" });
    if (hasFetchedHistory) fetchSentDrafts();
  };

  const startEdit = useCallback((draft: DraftAction) => {
    setEditingId(draft.id);
    setEditSubject(draft.subject || "");
    setEditBody(draft.body || "");
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditSubject("");
    setEditBody("");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    setSavingEdit(true);
    const success = await updateDraft(editingId, { subject: editSubject, body: editBody });
    setSavingEdit(false);
    if (success) {
      toast({ title: "Draft updated" });
      setEditingId(null);
    } else {
      toast({ title: "Failed to save", variant: "destructive" });
    }
  }, [editingId, editSubject, editBody, updateDraft]);

  return (
    <div className="max-w-3xl mx-auto px-4">
      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-muted/30 rounded-xl p-1">
        <button
          onClick={() => setTab("pending")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
            tab === "pending"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          Pending
          {drafts.length > 0 && (
            <span className="bg-accent/15 text-accent text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {drafts.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("sent")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
            tab === "sent"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <SendHorizonal className="w-3.5 h-3.5" />
          Sent
        </button>
        <button
          onClick={() => setTab("history")}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
            tab === "history"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
      </div>

      {!gmailConnected && (
        <div
          className="glass-card rounded-2xl p-4 mb-5 flex items-center gap-3"
          style={{ animation: "fade-up 0.3s ease-out both" }}
        >
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Plug className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Connect Gmail</p>
            <p className="text-xs text-muted-foreground">
              Go to Integrations to let {agentName} draft and send emails on your behalf.
            </p>
          </div>
        </div>
      )}

      {/* Pending tab */}
      {tab === "pending" && (
        <>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
                <Inbox className="w-7 h-7 text-success" />
              </div>
              <h2 className="font-display text-lg text-foreground mb-1">All clear</h2>
              <p className="text-sm text-muted-foreground">
                No pending drafts. Ask {agentName} to draft replies.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {drafts.map((draft, index) => {
                const isProcessing = processingIds.has(draft.id);
                const isEditing = editingId === draft.id;
                return (
                  <div
                    key={draft.id}
                    className="glass-card rounded-2xl p-4 hover:approval-glow transition-all duration-300"
                    style={{ animation: `fade-up 0.4s ease-out ${index * 0.06}s both` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-accent/10">
                        <Mail className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-foreground text-sm">
                            Reply to {draft.to_name || draft.to_email}
                          </h3>
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 mb-3">
                            <input
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              className="w-full text-xs font-medium bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-accent/30"
                              placeholder="Subject"
                            />
                            <textarea
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              rows={5}
                              className="w-full text-xs bg-muted/50 border border-border/50 rounded-lg px-3 py-2 text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent/30"
                              placeholder="Email body"
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={cancelEdit}
                                disabled={savingEdit}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={saveEdit}
                                disabled={savingEdit}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                              >
                                {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-medium text-foreground/80 mb-1">{draft.subject}</p>
                            <p className="text-xs text-muted-foreground mb-3 whitespace-pre-wrap">
                              {draft.body}
                            </p>
                          </>
                        )}

                        {!isEditing && (
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(draft.created_at).toLocaleString()}
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEdit(draft)}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleReject(draft.id)}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                              >
                                <X className="w-3 h-3" />
                                Dismiss
                              </button>
                              <button
                                onClick={() => handleApprove(draft.id)}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                              >
                                {isProcessing ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Send className="w-3 h-3" />
                                )}
                                {isProcessing ? "Sending…" : "Approve & Send"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Sent tab */}
      {tab === "sent" && (
        <>
          {!gmailConnected ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Plug className="w-7 h-7 text-muted-foreground" />
              </div>
              <h2 className="font-display text-lg text-foreground mb-1">Gmail not connected</h2>
              <p className="text-sm text-muted-foreground">
                Connect Gmail in Integrations to view sent emails.
              </p>
            </div>
          ) : loadingSentEmails ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sentEmails.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <SendHorizonal className="w-7 h-7 text-muted-foreground" />
              </div>
              <h2 className="font-display text-lg text-foreground mb-1">No sent emails</h2>
              <p className="text-sm text-muted-foreground">
                Your recently sent emails will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sentEmails.map((email, index) => {
                const toMatch = email.snippet;
                const subjectText = email.subject || "(no subject)";
                const dateStr = email.date ? new Date(email.date).toLocaleString() : "";
                return (
                  <div
                    key={email.id}
                    className="glass-card rounded-xl p-3.5 transition-all duration-200"
                    style={{ animation: `fade-up 0.3s ease-out ${index * 0.04}s both` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent/10">
                        <SendHorizonal className="w-3.5 h-3.5 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground text-sm truncate">{subjectText}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{toMatch}</p>
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-1.5">
                          <Clock className="w-2.5 h-2.5" />
                          {dateStr}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* History tab */}
      {tab === "history" && (
        <>
          {loadingSent ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : sentDrafts.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <History className="w-7 h-7 text-muted-foreground" />
              </div>
              <h2 className="font-display text-lg text-foreground mb-1">No history yet</h2>
              <p className="text-sm text-muted-foreground">
                Approved and dismissed drafts will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sentDrafts.map((draft, index) => {
                const config = statusConfig[draft.status] || statusConfig.failed;
                const StatusIcon = config.icon;
                return (
                  <div
                    key={draft.id}
                    className="glass-card rounded-xl p-3.5 transition-all duration-200 opacity-90"
                    style={{ animation: `fade-up 0.3s ease-out ${index * 0.04}s both` }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-muted/50">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <h3 className="font-medium text-foreground text-sm truncate">
                            {draft.to_name || draft.to_email}
                          </h3>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.className}`}>
                            <StatusIcon className="w-3 h-3" />
                            {config.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{draft.subject}</p>
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(draft.updated_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
