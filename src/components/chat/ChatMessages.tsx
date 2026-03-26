import { Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Message } from "../OrchestratorChat";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessages = ({ messages, isLoading, messagesEndRef }: ChatMessagesProps) => (
  <div className="space-y-8 py-8">
    {messages.map((msg, i) => (
      <div
        key={i}
        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-3`}
        style={{ animation: "fade-up 0.3s ease-out both" }}
      >
        {msg.role === "assistant" && (
          <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center mt-1 shrink-0 ring-1 ring-primary/10">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
        )}
        <div
          className={`max-w-[72%] ${
            msg.role === "user"
              ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-5 py-3 shadow-sm"
              : "bg-card border border-border/60 rounded-2xl rounded-bl-sm px-5 py-4 shadow-sm"
          }`}
        >
          {msg.role === "assistant" ? (
            <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-headings:mb-2 prose-headings:mt-4 first:prose-headings:mt-0 prose-p:text-foreground prose-p:leading-relaxed prose-p:mb-3 last:prose-p:mb-0 prose-li:text-foreground prose-li:leading-relaxed prose-ul:my-2 prose-ol:my-2 prose-strong:text-foreground prose-code:text-accent prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs prose-hr:my-4 prose-hr:border-border">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
          )}
        </div>
      </div>
    ))}

    {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
      <div className="flex justify-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="bg-card border border-border/60 rounded-2xl rounded-bl-sm px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-medium">Thinking…</span>
          </div>
        </div>
      </div>
    )}

    <div ref={messagesEndRef} />
  </div>
);
