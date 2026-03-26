import { Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Message } from "../OrchestratorChat";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatMessages = ({ messages, isLoading, messagesEndRef }: ChatMessagesProps) => (
  <div className="space-y-5 py-6">
    {messages.map((msg, i) => (
      <div
        key={i}
        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        style={{ animation: "fade-up 0.25s ease-out both" }}
      >
        {msg.role === "assistant" && (
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mr-2.5 mt-0.5 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
        )}
        <div
          className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
            msg.role === "user"
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted/50 border border-border/50 rounded-bl-md"
          }`}
        >
          {msg.role === "assistant" ? (
            <div className="prose prose-sm max-w-none text-foreground prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground prose-p:leading-relaxed prose-li:text-foreground prose-strong:text-foreground prose-code:text-accent prose-code:bg-background prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-xs">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
          )}
        </div>
      </div>
    ))}

    {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
      <div className="flex justify-start">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mr-2.5 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-bl-md px-4 py-2.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Thinking…</span>
          </div>
        </div>
      </div>
    )}

    <div ref={messagesEndRef} />
  </div>
);
