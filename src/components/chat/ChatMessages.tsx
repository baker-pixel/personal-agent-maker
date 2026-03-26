import { Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Message } from "../OrchestratorChat";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessages = ({ messages, isLoading, messagesEndRef }: ChatMessagesProps) => (
  <div className="space-y-6 py-8">
    {messages.map((msg, i) => (
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
