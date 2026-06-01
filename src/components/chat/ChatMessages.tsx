import { Loader2, Sparkles, Inbox, Check, Sun, MailSearch, Clock, CalendarClock, FileText, PenLine, CalendarSearch, FileBarChart, ChevronRight, RefreshCw, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useState, useCallback, useMemo } from "react";
import { stripAgentBlocks } from "@/lib/stripAgentBlocks";
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

  const normalize = (p: any): DraftBlock | null => {
    const to_email = (p.to_email || p.to || "").trim();
    if (!to_email || !to_email.includes("@")) return null;
    return { to_email, to_name: p.to_name, subject: p.subject || "", body: p.body || "", thread_id: p.thread_id, in_reply_to: p.in_reply_to };
  };

  // Fenced blocks
  const fencedRegex = /```draft-json\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = fencedRegex.exec(content)) !== null) {
    try { const n = normalize(JSON.parse(match[1].trim())); if (n) drafts.push(n); } catch {}
  }

  // Bare JSON fallback
  if (drafts.length === 0) {
    let depth = 0, start = -1, buf = "";
    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      if (c === "{") { if (depth === 0) { start = i; buf = ""; } depth++; }
      if (depth > 0) buf += c;
      if (c === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          try { const p = JSON.parse(buf); const n = normalize(p); if (n) drafts.push(n); } catch {}
          start = -1; buf = "";
        }
      }
    }
  }
  return drafts;
}

function stripDraftBlocks(content: string): string {
  return stripAgentBlocks(content);
}

interface NextStepItem {
  label: string;
  prompt: string;
}

function extractNextSteps(content: string): NextStepItem[] {
  // Match a "Next Steps:" section followed by bullet points
  const sectionRegex = /\n*\*{0,2}Next\s*Steps:?\*{0,2}\s*\n((?:\s*[-*•]\s+.+\n?)+)/i;
  const match = sectionRegex.exec(content);
  if (!match) return [];

  const bulletBlock = match[1];
  const bullets = bulletBlock.match(/[-*•]\s+(.+)/g);
  if (!bullets) return [];

  return bullets.map((b) => {
    // Strip the bullet marker and clean markdown bold
    const raw = b.replace(/^[-*•]\s+/, "").trim();
    const clean = raw.replace(/\*\*/g, "").replace(/\?$/, "").trim();
    return { label: clean, prompt: clean };
  });
}

function stripNextSteps(content: string): string {
  return content.replace(/\n*\*{0,2}Next\s*Steps:?\*{0,2}\s*\n((?:\s*[-*•]\s+.+\n?)+)/i, "").trim();
}

interface YesNoQuestion {
  question: string;
  yesPrompt: string;
}

function extractYesNoQuestions(content: string): YesNoQuestion[] {
  const questions: YesNoQuestion[] = [];
  // Match "Would you like me to..." or "Shall I..." or "Do you want me to..." questions
  const patterns = [
    /(?:^|\n)\s*((?:Would you like me to|Shall I|Do you want me to|Should I|Want me to)[^?]*\??)/gim,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(content)) !== null) {
      const q = match[1].replace(/\*\*/g, "").trim();
      // Don't extract if it's inside a bullet list (those become next steps)
      if (q) {
        questions.push({
          question: q,
          yesPrompt: `Yes, ${q.replace(/^(Would you like me to|Shall I|Do you want me to|Should I|Want me to)\s*/i, "").replace(/\?$/, "").trim()}`,
        });
      }
    }
  }
  return questions;
}

function stripYesNoQuestions(content: string): string {
  return content
    .replace(/(?:^|\n)\s*(?:Would you like me to|Shall I|Do you want me to|Should I|Want me to)[^?]*\??/gim, "")
    .trim();
}

interface FollowUpAction {
  label: string;
  prompt: string;
  icon: React.ElementType;
}

const followUpSets: { keywords: string[]; actions: FollowUpAction[] }[] = [
  {
    keywords: ["briefing", "morning", "today's summary", "good morning"],
    actions: [
      { label: "Triage my inbox", prompt: "Triage my inbox. Categorize recent emails as Urgent, Needs Reply, FYI, or Newsletter. Draft responses for anything that needs attention.", icon: MailSearch },
      { label: "Prep for meetings", prompt: "Prepare me for today's meetings. Pull context from recent emails with each attendee and suggest talking points.", icon: CalendarClock },
      { label: "Auto-draft replies", prompt: "Auto-draft replies for all my emails that need a response.", icon: PenLine },
    ],
  },
  {
    keywords: ["triage", "inbox", "categoriz", "urgent", "needs reply", "fyi"],
    actions: [
      { label: "Auto-draft replies", prompt: "Auto-draft replies for all my emails that need a response. Generate context-aware, professional drafts I can review and approve.", icon: PenLine },
      { label: "Check follow-ups", prompt: "Check my follow-ups. What sent emails haven't gotten a reply? Draft polite follow-up messages.", icon: Clock },
      { label: "Morning briefing", prompt: "Give me my morning briefing. Summarize what I need to know today.", icon: Sun },
    ],
  },
  {
    keywords: ["draft", "reply", "replies", "composed", "written"],
    actions: [
      { label: "Check follow-ups", prompt: "Check my follow-ups. What sent emails haven't gotten a reply?", icon: Clock },
      { label: "Meeting prep", prompt: "Prepare me for today's meetings with context and talking points.", icon: CalendarClock },
      { label: "Weekly report", prompt: "Generate my weekly report summarizing accomplishments and priorities.", icon: FileBarChart },
    ],
  },
  {
    keywords: ["meeting", "prep", "talking points", "agenda", "attendee"],
    actions: [
      { label: "Find free time", prompt: "Show me my availability for the next 5 business days. Find the best open slots for a 30-minute meeting.", icon: CalendarSearch },
      { label: "Triage my inbox", prompt: "Triage my inbox and categorize recent emails.", icon: MailSearch },
      { label: "Summarize a doc", prompt: "I need to summarize a document. I'll paste the text — give me an executive summary.", icon: FileText },
    ],
  },
  {
    keywords: ["follow-up", "follow up", "overdue", "no reply", "haven't responded"],
    actions: [
      { label: "Auto-draft replies", prompt: "Auto-draft replies for all my emails that need a response.", icon: PenLine },
      { label: "Morning briefing", prompt: "Give me my morning briefing.", icon: Sun },
      { label: "Weekly report", prompt: "Generate my weekly report.", icon: FileBarChart },
    ],
  },
  {
    keywords: ["calendar", "conflict", "double-book", "reschedule", "availability", "free time", "open slot"],
    actions: [
      { label: "Meeting prep", prompt: "Prepare me for today's meetings with context and talking points.", icon: CalendarClock },
      { label: "Triage my inbox", prompt: "Triage my inbox and categorize recent emails.", icon: MailSearch },
      { label: "Auto-draft replies", prompt: "Auto-draft replies for all my emails that need a response.", icon: PenLine },
    ],
  },
  {
    keywords: ["weekly report", "accomplishments", "summary", "this week"],
    actions: [
      { label: "Morning briefing", prompt: "Give me my morning briefing.", icon: Sun },
      { label: "Check follow-ups", prompt: "Check my follow-ups. What sent emails haven't gotten a reply?", icon: Clock },
      { label: "Find free time", prompt: "Show me my availability for the next 5 business days.", icon: CalendarSearch },
    ],
  },
];

const defaultFollowUps: FollowUpAction[] = [
  { label: "Morning briefing", prompt: "Give me my morning briefing. Summarize what I need to know today.", icon: Sun },
  { label: "Triage inbox", prompt: "Triage my inbox. Categorize recent emails as Urgent, Needs Reply, FYI, or Newsletter.", icon: MailSearch },
  { label: "Auto-draft replies", prompt: "Auto-draft replies for all my emails that need a response.", icon: PenLine },
];

function getFollowUpActions(lastAssistantContent: string): FollowUpAction[] {
  const lower = lastAssistantContent.toLowerCase();
  for (const set of followUpSets) {
    if (set.keywords.some((kw) => lower.includes(kw))) {
      return set.actions;
    }
  }
  return defaultFollowUps;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onSend?: (text: string) => void;
  onRegenerate?: () => void;
  onEditResend?: () => void;
}

export const ChatMessages = ({ messages, isLoading, messagesEndRef, onSend, onRegenerate, onEditResend }: ChatMessagesProps) => {
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

  const lastAssistantMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return "";
  }, [messages]);

  const followUps = useMemo(() => getFollowUpActions(lastAssistantMsg), [lastAssistantMsg]);

  return (
    <div className="space-y-6 py-8">
      {messages.map((msg, i) => {
        const drafts = msg.role === "assistant" ? extractDrafts(msg.content) : [];
        const nextSteps = msg.role === "assistant" ? extractNextSteps(msg.content) : [];
        const yesNoQuestions = msg.role === "assistant" ? extractYesNoQuestions(msg.content) : [];
        const isLastAssistant = msg.role === "assistant" && i === messages.length - 1;
        let cleanContent = msg.role === "assistant" && drafts.length > 0
          ? stripDraftBlocks(msg.content)
          : msg.content;
        if (msg.role === "assistant" && nextSteps.length > 0) {
          cleanContent = stripNextSteps(cleanContent);
        }
        if (msg.role === "assistant" && yesNoQuestions.length > 0) {
          cleanContent = stripYesNoQuestions(cleanContent);
        }

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

                  {/* Next Steps as clickable buttons */}
                  {nextSteps.length > 0 && isLastAssistant && !isLoading && onSend && (
                    <div className="mt-4 pt-3 border-t border-border/50 space-y-1.5">
                      <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-2">Next Steps</p>
                      {nextSteps.map((step, si) => (
                        <button
                          key={si}
                          onClick={() => onSend(step.prompt)}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-xs font-medium text-foreground/80 hover:text-foreground bg-muted/30 hover:bg-accent/10 border border-border/30 hover:border-accent/20 transition-all duration-200 text-left group"
                        >
                          <ChevronRight className="w-3.5 h-3.5 text-accent shrink-0 group-hover:translate-x-0.5 transition-transform" />
                          <span className="line-clamp-2">{step.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Yes/No question buttons */}
                  {yesNoQuestions.length > 0 && isLastAssistant && !isLoading && onSend && (
                    <div className="mt-4 pt-3 border-t border-border/50 space-y-2">
                      {yesNoQuestions.map((q, qi) => (
                        <div key={qi} className="space-y-1.5">
                          <p className="text-xs text-foreground/70">{q.question}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => onSend(q.yesPrompt)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-all duration-200"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Yes
                            </button>
                            <button
                              onClick={() => onSend("No thanks, skip that.")}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted border border-border/30 transition-all duration-200"
                            >
                              No thanks
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Regenerate / Edit & Resend */}
                  {isLastAssistant && !isLoading && (onRegenerate || onEditResend) && (
                    <div className="mt-3 pt-2 border-t border-border/30 flex gap-2">
                      {onRegenerate && (
                        <button
                          onClick={onRegenerate}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/60 transition-all duration-200"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Regenerate
                        </button>
                      )}
                      {onEditResend && (
                        <button
                          onClick={onEditResend}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/60 transition-all duration-200"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit & Resend
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

      {/* Follow-up action pills after last assistant message */}
      {!isLoading && messages.length > 0 && messages[messages.length - 1]?.role === "assistant" && onSend && (
        <div className="flex flex-wrap gap-2 pl-11 animate-fade-up" style={{ animationDelay: "0.2s" }}>
          {followUps.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => onSend(action.prompt)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border/40 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-accent/30 hover:bg-accent/[0.04] transition-all duration-200 shadow-sm"
              >
                <Icon className="w-3.5 h-3.5" />
                {action.label}
              </button>
            );
          })}
        </div>
      )}

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
