import { useMemo, useState } from "react";
import { useDraftActions } from "@/hooks/useDraftActions";
import { toast } from "@/hooks/use-toast";
import { Save, Check, Send, Loader2 } from "lucide-react";

interface DraftData {
  to_email: string;
  to_name?: string;
  subject: string;
  body: string;
}

/**
 * Parses agent message text and renders "Save to Inbox" buttons
 * for any ```draft-json blocks found.
 */
export function DraftJsonParser({ text }: { text: string }) {
  const { saveDraft, approveDraft } = useDraftActions();
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [sentIndices, setSentIndices] = useState<Set<number>>(new Set());
  const [sendingIndices, setSendingIndices] = useState<Set<number>>(new Set());

  const drafts = useMemo(() => {
    const results: DraftData[] = [];
    const regex = /```draft-json\s*\n([\s\S]*?)\n```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.to_email && parsed.subject && parsed.body) {
          results.push(parsed);
        }
      } catch {
        // skip malformed
      }
    }
    return results;
  }, [text]);

  if (drafts.length === 0) return null;

  const handleSave = async (draft: DraftData, index: number) => {
    const result = await saveDraft({
      to_email: draft.to_email,
      to_name: draft.to_name,
      subject: draft.subject,
      body: draft.body,
    });
    if (result) {
      setSavedIndices((prev) => new Set(prev).add(index));
      toast({ title: "Draft saved", description: `Queued in Approval Inbox for ${draft.to_name || draft.to_email}` });
    } else {
      toast({ title: "Error", description: "Could not save draft. Are you signed in?", variant: "destructive" });
    }
  };

  const handleSendNow = async (draft: DraftData, index: number) => {
    setSendingIndices((prev) => new Set(prev).add(index));
    try {
      const saved = await saveDraft({
        to_email: draft.to_email,
        to_name: draft.to_name,
        subject: draft.subject,
        body: draft.body,
      });
      if (!saved) throw new Error("Could not save draft");
      const { success, error } = await approveDraft(saved.id);
      if (!success) throw new Error(error || "Send failed");
      setSentIndices((prev) => new Set(prev).add(index));
      toast({ title: "Email sent", description: `Sent to ${draft.to_name || draft.to_email}` });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSendingIndices((prev) => { const s = new Set(prev); s.delete(index); return s; });
    }
  };

  return (
    <div className="mt-3 space-y-2">
      {drafts.map((draft, i) => {
        const isSent = sentIndices.has(i);
        const isSending = sendingIndices.has(i);
        const isSaved = savedIndices.has(i);
        const isDone = isSent || isSaved;
        return (
          <div key={i} className="flex items-center gap-2">
            {isSent ? (
              <span className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-green-500/10 text-green-600">
                <Check className="w-3.5 h-3.5" />
                Sent to {draft.to_name || draft.to_email}
              </span>
            ) : isSaved ? (
              <span className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-accent/10 text-accent">
                <Check className="w-3.5 h-3.5" />
                Saved to Inbox
              </span>
            ) : (
              <>
                <button
                  onClick={() => handleSave(draft, i)}
                  disabled={isDone || isSending}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-40 disabled:cursor-default"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save draft
                </button>
                <button
                  onClick={() => handleSendNow(draft, i)}
                  disabled={isDone || isSending}
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-default"
                >
                  {isSending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {isSending ? "Sending…" : `Send to ${draft.to_name || draft.to_email}`}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
