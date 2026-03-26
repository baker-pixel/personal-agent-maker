import { Loader2, Sparkles, Inbox, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useState, useCallback } from "react";
import { useDraftActions } from "@/hooks/useDraftActions";
import { toast } from "@/hooks/use-toast";
import type { Message } from "../OrchestratorChat";

interface DraftBlock {
  to_email: string;
  to_name?: string;
  subject: string;
  body: string;
  thread_id?: string;
  in_reply_to?: string;
}

function extractDrafts(content: string): DraftBlock[] {
  const drafts: DraftBlock[] = [];
  const regex = /```draft-json\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.to_email && parsed.subject && parsed.body) {
        drafts.push(parsed);
      }
    } catch {}
  }
  return drafts;
}

function stripDraftBlocks(content: string): string {
  return content.replace(/```draft-json\s*\n[\s\S]*?\n```/g, "").trim();
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessages = ({ messages, isLoading, messagesEndRef }: ChatMessagesProps) => {
  const { saveDraft } = useDraftActions();
  const [savedDrafts, setSavedDrafts] = useState<Set<string>>(new Set());
  const [savingDrafts, setSavingDrafts] = useState<Set<string>>(new Set());

  const handleSaveDraft = useCallback(async (draft: DraftBlock, index: number, msgIndex: number) => {
    const key = `${msgIndex}-${index}`;
    setSavingDrafts((prev) => new Set(prev).add(key));

    const result = await saveDraft({
      to_email: draft.to_email,
      to_name: draft.to_name,
      subject: draft.subject,
      body: draft.body,
      thread_id: draft.thread_id,
      in_reply_to: draft.in_reply_to,
    });

    setSavingDrafts((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    if (result) {
      setSavedDrafts((prev) => new Set(prev).add(key));
      toast({ title: "Draft saved", description: `Reply to ${draft.to_name || draft.to_email} added to your Approval Inbox.` });
    } else {
      toast({ title: "Failed to save draft", variant: "destructive" });
    }
  }, [saveDraft]);

  const handleSaveAll = useCallback(async (drafts: DraftBlock[], msgIndex: number) => {
    for (let i = 0; i < drafts.length; i++) {
      const key = `${msgIndex}-${i}`;
      if (!savedDrafts.has(key)) {
        await handleSaveDraft(drafts[i], i, msgIndex);
      }
    }
  }, [handleSaveDraft, savedDrafts]);

  return (
    <div className="space-y-6 py-8">
      {messages.map((msg, i) => {
        const drafts = msg.role === "assistant" ? extractDrafts(msg.content) : [];
        const cleanContent = msg.role === "assistant" && drafts.length > 0
          ? stripDraftBlocks(msg.content)
          : msg.content;

        return (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-3`}
            style={{ animation: "fade-up 0.3s ease-out both", animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center mt-1 shrink-0 ring-1 ring-accent/15">
                <Sparkles className="w-4 h-4 text-accent" />
              </div>
            )}
            <div
              className={`max-w-[75%] ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-5 py-3 shadow-md"
                  : "bg-card border border-border/50 rounded-2xl rounded-bl-md px-5 py-4 shadow-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <>
                  <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0 prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-3 last:prose-p:mb-0 prose-li:text-foreground prose-li:leading-relaxed prose-ul:my-2 prose-ol:my-2 prose-strong:text-foreground prose-code:text-accent prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-hr:my-4 prose-hr:border-border">
                    <ReactMarkdown>{cleanContent}</ReactMarkdown>
                  </div>

                  {/* Draft save buttons */}
                  {drafts.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-border/50 space-y-2">
                      {drafts.map((draft, di) => {
                        const key = `${i}-${di}`;
                        const isSaved = savedDrafts.has(key);
                        const isSaving = savingDrafts.has(key);
                        return (
                          <button
                            key={di}
                            onClick={() => handleSaveDraft(draft, di, i)}
                            disabled={isSaved || isSaving}
                            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-60 disabled:cursor-default"
                          >
                            {isSaved ? (
                              <Check className="w-3.5 h-3.5 text-success" />
                            ) : isSaving ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Inbox className="w-3.5 h-3.5" />
                            )}
                            {isSaved
                              ? `Saved: Reply to ${draft.to_name || draft.to_email}`
                              : isSaving
                              ? "Saving…"
                              : `Save draft → ${draft.to_name || draft.to_email}`}
                          </button>
                        );
                      })}
                      {drafts.length > 1 && (
                        <button
                          onClick={() => handleSaveAll(drafts, i)}
                          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          <Inbox className="w-3.5 h-3.5" />
                          Save all {drafts.length} drafts to Approval Inbox
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              )}
            </div>
          </div>
        );
      })}

      {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
        <div className="flex justify-start gap-3 animate-fade-in">
          <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center shrink-0 ring-1 ring-accent/15">
            <Sparkles className="w-4 h-4 text-accent" />
          </div>
          <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-5 py-4 shadow-sm">
            <div className="flex items-center gap-3 text-muted-foreground">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse-soft" style={{ animationDelay: '0s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
              </div>
              <span className="text-xs font-medium">Thinking…</span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};
