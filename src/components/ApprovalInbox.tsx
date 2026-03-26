import { useState } from "react";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useDraftActions } from "@/hooks/useDraftActions";
import { toast } from "@/hooks/use-toast";
import {
  Check,
  X,
  Mail,
  Calendar,
  Bell,
  FileText,
  ListChecks,
  Clock,
  Plug,
  Loader2,
  Send,
  Inbox,
} from "lucide-react";

const priorityStyles: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-warning/10 text-warning",
  low: "bg-muted text-muted-foreground",
};

export const ApprovalInbox = () => {
  const { agentName } = useAgent();
  const { isConnected } = useIntegrations();
  const { drafts, loading, approveDraft, rejectDraft } = useDraftActions();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const gmailConnected = isConnected("gmail");

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
    } else {
      toast({ title: "Failed to send", description: result.error, variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    await rejectDraft(id);
    toast({ title: "Draft dismissed" });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground mb-2">Approval Inbox</h1>
        <p className="text-muted-foreground">
          {agentName} prepared {drafts.length} draft{drafts.length !== 1 ? "s" : ""} for your review.
        </p>
      </div>

      {!gmailConnected && (
        <div
          className="glass-card rounded-2xl p-4 mb-6 flex items-center gap-3"
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

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : drafts.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-8 h-8 text-success" />
          </div>
          <h2 className="font-display text-xl text-foreground mb-2">All clear</h2>
          <p className="text-muted-foreground">
            No pending drafts. Ask {agentName} to triage your emails or draft replies.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft, index) => {
            const isProcessing = processingIds.has(draft.id);
            return (
              <div
                key={draft.id}
                className="glass-card rounded-2xl p-5 hover:approval-glow transition-all duration-300"
                style={{ animation: `fade-up 0.4s ease-out ${index * 0.06}s both` }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-accent/10">
                    <Mail className="w-5 h-5 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-foreground text-sm">
                        Reply to {draft.to_name || draft.to_email}
                      </h3>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-info/10 text-info">
                        Gmail
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground/80 mb-1">{draft.subject}</p>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-3 whitespace-pre-wrap">
                      {draft.body}
                    </p>

                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(draft.created_at).toLocaleString()}
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(draft.id)}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                        <button
                          onClick={() => handleApprove(draft.id)}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          {isProcessing ? "Sending…" : "Approve & Send"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
