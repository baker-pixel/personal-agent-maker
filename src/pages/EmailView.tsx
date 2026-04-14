import { useState, useEffect, useCallback } from "react";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Check, X, Edit2, Send, Mic, MicOff, ChevronDown, ChevronUp, Inbox, GripVertical, Loader2, RefreshCw, Mail } from "lucide-react";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import { useAgent } from "@/contexts/AgentContext";

import { supabase } from "@/integrations/supabase/client";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { PriorityLegend } from "@/components/PriorityLegend";

type Priority = "urgent" | "important" | "low" | "noise";

interface Email {
  id: string;
  sender: string;
  senderEmail: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  priority: Priority;
  needsAction: boolean;
  agentDraft?: string;
  handled: boolean;
  isUnread: boolean;
  threadId?: string;
}

const priorityColor: Record<Priority, string> = {
  urgent: "bg-priority-urgent",
  important: "bg-priority-important",
  low: "bg-priority-low",
  noise: "bg-priority-noise",
};

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

function extractName(from: string): string {
  return from.replace(/<.*>/, "").replace(/"/g, "").trim() || from;
}

function guessPriority(email: { isUnread: boolean; subject: string; from: string }): Priority {
  const subj = email.subject.toLowerCase();
  if (subj.includes("urgent") || subj.includes("asap") || subj.includes("immediately")) return "urgent";
  if (subj.includes("action") || subj.includes("approval") || subj.includes("review") || subj.includes("confirm")) return "important";
  if (subj.includes("newsletter") || subj.includes("digest") || subj.includes("unsubscribe") || subj.includes("promo")) return "noise";
  if (email.isUnread) return "important";
  return "low";
}

export default function EmailView() {
  const navigate = useNavigate();
  const { isConnected } = useIntegrations();
  const { agentName } = useAgent();
  const [desk, setDesk] = useState<"agent" | "my">("agent");
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const annieChat = useAnnieChat(agentName);
  const speech = useSpeechRecognition({
    onResult: (text) => setAgentInput((prev) => (prev ? prev + " " : "") + text),
  });

  const gmailConnected = isConnected("gmail");

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    speech.stopListening();
    annieChat.send(agentInput.trim());
    setAgentInput("");
  };

  const [autoHandledOpen, setAutoHandledOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [deskAssignments, setDeskAssignments] = useState<Record<string, "agent" | "my">>({});
  const [dragOverDesk, setDragOverDesk] = useState<"agent" | "my" | null>(null);


  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("gmail-fetch", {
        body: null,
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      const fetched: Email[] = (data?.emails || []).map((e: any) => {
        const priority = guessPriority({ isUnread: e.isUnread, subject: e.subject, from: e.from });
        const needsAction = priority === "urgent" || priority === "important";
        return {
          id: e.id,
          sender: extractName(e.from),
          senderEmail: extractEmail(e.from),
          subject: e.subject || "(no subject)",
          preview: e.snippet || "",
          body: "",
          time: formatTime(e.date),
          priority,
          needsAction,
          handled: !needsAction,
          isUnread: e.isUnread,
          threadId: e.threadId,
        };
      });

      setEmails(fetched);

      // Initialize desk assignments: only urgent goes to user's desk
      const assignments: Record<string, "agent" | "my"> = {};
      fetched.forEach((e) => {
        assignments[e.id] = e.priority === "urgent" ? "my" : "agent";
      });
      setDeskAssignments(assignments);
    } catch (err: any) {
      console.error("Failed to fetch emails:", err);
      setError(err.message || "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gmailConnected) fetchEmails();
  }, [gmailConnected, fetchEmails]);

  const agentDeskEmails = emails.filter((e) => deskAssignments[e.id] === "agent");
  const myDeskEmails = emails.filter((e) => deskAssignments[e.id] === "my");
  const autoHandledEmails = emails.filter((e) => e.handled && !e.needsAction && deskAssignments[e.id] === "agent");
  const currentEmails = desk === "agent" ? agentDeskEmails : myDeskEmails;

  const moveToDesk = useCallback((emailId: string, targetDesk: "agent" | "my") => {
    setDeskAssignments((prev) => ({ ...prev, [emailId]: targetDesk }));
  }, []);

  const openEmail = async (email: Email) => {
    setSelectedEmail(email);
    setDraftText(email.agentDraft || "");
    setEditingDraft(false);

    // Fetch full body if not loaded yet
    if (!email.body) {
      setLoadingBody(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("gmail-fetch", {
          body: null,
          headers: {},
        });
        // Use query params via URL - invoke doesn't support query params directly,
        // so we'll use fetch directly
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gmail-fetch?messageId=${email.id}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );
        const msgData = await resp.json();
        if (msgData.error) throw new Error(msgData.error);

        const bodyText = msgData.isHtml
          ? msgData.body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
          : msgData.body;

        setEmails((prev) =>
          prev.map((e) => (e.id === email.id ? { ...e, body: bodyText } : e))
        );
        setSelectedEmail((prev) => prev ? { ...prev, body: bodyText } : prev);
      } catch (err: any) {
        console.error("Failed to fetch email body:", err);
      } finally {
        setLoadingBody(false);
      }
    }
  };

  const DeskEmpty = ({ message, sub }: { message: string; sub: string }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mb-4">
        <Inbox className="w-8 h-8 text-success" />
      </div>
      <h2 className="font-display text-xl font-semibold mb-2">{message}</h2>
      <p className="text-muted-foreground text-sm">{sub}</p>
    </div>
  );

  const AutoHandledSection = () => (
    <div className="mt-6">
      <button
        onClick={() => setAutoHandledOpen(!autoHandledOpen)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Sparkles className="w-4 h-4 text-accent" />
        <span>{agentName} handled {autoHandledEmails.length} emails today</span>
        {autoHandledOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      <AnimatePresence>
        {autoHandledOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {autoHandledEmails.map((email) => (
                <div key={email.id} className="flex items-center gap-3 bg-muted/50 rounded-lg p-3 text-sm">
                  <div className={`w-2 h-2 rounded-full ${priorityColor[email.priority]}`} />
                  <span className="font-medium">{email.sender}</span>
                  <span className="text-muted-foreground truncate flex-1">{email.subject}</span>
                  <Check className="w-4 h-4 text-success shrink-0" />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  const EmailCard = ({ email }: { email: Email }) => (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("emailId", email.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => openEmail(email)}
      className="w-full text-left border rounded-xl p-4 bg-background hover:shadow-md hover:border-accent/30 transition-all relative cursor-grab active:cursor-grabbing group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <GripVertical className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground mt-1 shrink-0 transition-colors" />
          <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${priorityColor[email.priority]}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium text-sm truncate">
                {email.sender}
                {email.isUnread && <span className="ml-2 w-2 h-2 inline-block rounded-full bg-accent" />}
              </p>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">{email.time}</span>
            </div>
            <p className="text-sm font-medium mb-1 truncate">{email.subject}</p>
            <p className="text-xs text-muted-foreground truncate">{email.preview}</p>
          </div>
        </div>
      </div>
    </div>
  );

  // Not connected state
  if (!gmailConnected) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
          <div className="container flex items-center justify-between h-14 px-4">
            <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Admin</span>
            </button>
            <h1 className="font-display font-semibold">Email</h1>
            <div className="w-8" />
          </div>
        </nav>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <Mail className="w-12 h-12 text-accent mx-auto mb-4" />
            <h2 className="font-display text-2xl font-semibold mb-2">Connect Gmail</h2>
            <p className="text-muted-foreground mb-4">
              Connect your Gmail account in Settings to view and manage your emails here.
            </p>
            <Button onClick={() => navigate("/settings")} className="bg-accent text-accent-foreground hover:bg-accent/90">
              Go to Settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b bg-background sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
        <div className="container flex items-center justify-between h-14 px-4">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Admin</span>
          </button>
          <h1 className="font-display font-semibold">Email</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchEmails}
              disabled={loading}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Priority legend */}
      {!loading && !error && emails.length > 0 && <PriorityLegend />}

      {/* Loading */}
      {loading && emails.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-accent animate-spin mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Loading your inbox...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <X className="w-10 h-10 text-destructive mx-auto mb-3" />
            <p className="text-foreground font-medium mb-2">Failed to load emails</p>
            <p className="text-muted-foreground text-sm mb-4">{error}</p>
            <Button onClick={fetchEmails} variant="outline">Try again</Button>
          </div>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          <div className="border-b bg-card md:hidden">
            <div className="container flex">
              {(["agent", "my"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDesk(d)}
                  className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                    desk === d ? "border-accent text-accent" : "border-transparent text-muted-foreground"
                  }`}
                >
                  {d === "agent" ? `${agentName}'s Desk` : "My Desk"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 container py-4">
            <div className="hidden md:grid md:grid-cols-2 gap-6">
              <div
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverDesk("agent"); }}
                onDragLeave={() => setDragOverDesk(null)}
                onDrop={(e) => { e.preventDefault(); setDragOverDesk(null); const id = e.dataTransfer.getData("emailId"); if (id) moveToDesk(id, "agent"); }}
                className={`rounded-2xl border-2 border-dashed p-4 transition-colors min-h-[200px] ${dragOverDesk === "agent" ? "border-accent bg-accent/5" : "border-transparent"}`}
              >
                <h2 className="font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">{agentName}'s Desk</h2>
                {agentDeskEmails.length === 0 ? (
                  <DeskEmpty message={`${agentName} handled everything`} sub="All emails have been processed." />
                ) : (
                  <div className="space-y-3">{agentDeskEmails.map((email) => <EmailCard key={email.id} email={email} />)}</div>
                )}
                {autoHandledEmails.length > 0 && <AutoHandledSection />}
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverDesk("my"); }}
                onDragLeave={() => setDragOverDesk(null)}
                onDrop={(e) => { e.preventDefault(); setDragOverDesk(null); const id = e.dataTransfer.getData("emailId"); if (id) moveToDesk(id, "my"); }}
                className={`rounded-2xl border-2 border-dashed p-4 transition-colors min-h-[200px] ${dragOverDesk === "my" ? "border-accent bg-accent/5" : "border-transparent"}`}
              >
                <h2 className="font-display font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">My Desk</h2>
                {myDeskEmails.length === 0 ? (
                  <DeskEmpty message="Nothing needs your attention" sub="Your agent is taking care of business." />
                ) : (
                  <div className="space-y-3">{myDeskEmails.map((email) => <EmailCard key={email.id} email={email} />)}</div>
                )}
              </div>
            </div>

            <div className="md:hidden max-w-2xl mx-auto">
              {currentEmails.length === 0 ? (
                <DeskEmpty
                  message={desk === "agent" ? `${agentName} handled everything` : "Nothing needs your attention"}
                  sub={desk === "agent" ? "All emails have been processed." : "Your agent is taking care of business."}
                />
              ) : (
                <div className="space-y-3">{currentEmails.map((email) => <EmailCard key={email.id} email={email} />)}</div>
              )}
              {desk === "agent" && autoHandledEmails.length > 0 && <AutoHandledSection />}
            </div>
          </div>
        </>
      )}

      {/* Email Modal */}
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
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-background w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${priorityColor[selectedEmail.priority]}`} />
                    <span className="text-xs text-muted-foreground uppercase font-medium">{selectedEmail.priority}</span>
                  </div>
                  <button onClick={() => setSelectedEmail(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <h2 className="font-display text-xl font-semibold mb-1">{selectedEmail.subject}</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  From: {selectedEmail.sender} &lt;{selectedEmail.senderEmail}&gt; · {selectedEmail.time}
                </p>

                {loadingBody ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading email...</span>
                  </div>
                ) : (
                  <div className="bg-card border rounded-xl p-4 mb-6 whitespace-pre-line text-sm">
                    {selectedEmail.body || selectedEmail.preview}
                  </div>
                )}

                {selectedEmail.agentDraft && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xs font-bold">
                        {agentName.charAt(0)}
                      </div>
                      <span className="text-sm font-medium">{agentName}'s suggested reply</span>
                    </div>
                    {editingDraft ? (
                      <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} className="min-h-[120px] text-sm" />
                    ) : (
                      <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 whitespace-pre-line text-sm">{draftText}</div>
                    )}
                    <div className="flex gap-2">
                      <Button className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90" size="sm">
                        <Check className="w-4 h-4 mr-1" /> Approve & Send
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setEditingDraft(!editingDraft)}>
                        <Edit2 className="w-4 h-4 mr-1" /> {editingDraft ? "Preview" : "Edit"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedEmail(null)}>Dismiss</Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent Bottom Sheet */}
      <AnimatePresence>
        {agentSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/40 flex items-end justify-center"
            onClick={() => setAgentSheetOpen(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
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
                <Input
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAgentSend()}
                  placeholder={`Tell ${agentName} what to do...`}
                  className="flex-1"
                />
                <VoiceWaveform isActive={speech.isListening} />
                <Button size="icon" variant="ghost" onClick={speech.toggleListening} className={speech.isListening ? "text-destructive" : ""}>
                  {speech.isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                <Button size="icon" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleAgentSend}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Agent Button */}
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
