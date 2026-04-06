import { useState, useEffect, useCallback } from "react";
import { useAnnieChat } from "@/hooks/useAnnieChat";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Sparkles, Check, X, Edit2, Send, Mic, MicOff, ChevronDown, ChevronUp, Inbox, GripVertical } from "lucide-react";
import { VoiceWaveform } from "@/components/VoiceWaveform";
import AppMenu from "@/components/AppMenu";

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
}

const mockEmails: Email[] = [
  {
    id: "1", sender: "Sarah Chen", senderEmail: "sarah@acmedesign.co",
    subject: "Contract revision — needs your approval",
    preview: "Hi, I've updated the contract terms as discussed. The new payment schedule...",
    body: "Hi,\n\nI've updated the contract terms as discussed in our last meeting. The new payment schedule reflects the 60/40 split we agreed on.\n\nThe deadline for signing is this Friday. Could you review and confirm?\n\nBest,\nSarah",
    time: "9:15 AM", priority: "urgent", needsAction: true, handled: false,
    agentDraft: "Hi Sarah,\n\nThank you for sending the updated contract. I've reviewed the terms and the 60/40 payment schedule looks good.\n\nI'll have the signed copy back to you by Thursday.\n\nBest regards",
  },
  {
    id: "2", sender: "Tom Rivera", senderEmail: "tom@supplierco.com",
    subject: "Invoice #4521 — payment received",
    preview: "Just confirming we received your payment for invoice #4521...",
    body: "Hi,\n\nJust confirming we received your payment for invoice #4521. Everything is settled.\n\nThanks for the prompt payment!\n\nTom",
    time: "8:42 AM", priority: "low", needsAction: false, handled: true,
  },
  {
    id: "3", sender: "Maria Lopez", senderEmail: "maria@clientfirm.com",
    subject: "Meeting reschedule — Thursday?",
    preview: "Could we move our meeting from Wednesday to Thursday at 2 PM?",
    body: "Hi,\n\nSomething came up and I won't be available Wednesday. Could we move our meeting to Thursday at 2 PM instead?\n\nLet me know if that works.\n\nMaria",
    time: "8:20 AM", priority: "important", needsAction: true, handled: false,
    agentDraft: "Hi Maria,\n\nThursday at 2 PM works perfectly. I've updated my calendar.\n\nSee you then!",
  },
  {
    id: "4", sender: "Newsletter", senderEmail: "news@techdigest.io",
    subject: "This week in AI — March 31 roundup",
    preview: "Top stories: GPT-5 launch, AI regulation updates, new tools for SMBs...",
    body: "This week in AI:\n\n1. GPT-5 launches with improved reasoning\n2. EU AI Act enters enforcement phase\n3. New tools making AI accessible for SMBs\n\nRead more at techdigest.io",
    time: "7:00 AM", priority: "noise", needsAction: false, handled: true,
  },
  {
    id: "5", sender: "James Park", senderEmail: "james@vendorx.com",
    subject: "Proposal for Q2 partnership",
    preview: "We'd love to explore a partnership for Q2. I've attached our proposal...",
    body: "Hi,\n\nWe've been following your company's growth and would love to explore a partnership for Q2.\n\nI've attached our proposal with pricing and deliverables. Happy to hop on a call this week to discuss.\n\nBest,\nJames",
    time: "Yesterday", priority: "important", needsAction: true, handled: false,
    agentDraft: "Hi James,\n\nThanks for reaching out — the proposal looks interesting. I'd like to review the details more carefully before committing to a call.\n\nCould you send over the full deliverables breakdown? I'll get back to you by end of week.",
  },
];

const priorityColor: Record<Priority, string> = {
  urgent: "bg-priority-urgent",
  important: "bg-priority-important",
  low: "bg-priority-low",
  noise: "bg-priority-noise",
};

export default function EmailView() {
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("Annie");
  const [desk, setDesk] = useState<"agent" | "my">("agent");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [agentSheetOpen, setAgentSheetOpen] = useState(false);
  const [agentInput, setAgentInput] = useState("");
  const annieChat = useAnnieChat(agentName);
  const speech = useSpeechRecognition({
    onResult: (text) => setAgentInput((prev) => (prev ? prev + " " : "") + text),
  });

  const handleAgentSend = () => {
    if (!agentInput.trim()) return;
    speech.stopListening();
    annieChat.send(agentInput.trim());
    setAgentInput("");
  };

  const [autoHandledOpen, setAutoHandledOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [deskAssignments, setDeskAssignments] = useState<Record<string, "agent" | "my">>(() => {
    const assignments: Record<string, "agent" | "my"> = {};
    mockEmails.forEach((e) => {
      assignments[e.id] = e.needsAction ? "my" : "agent";
    });
    return assignments;
  });
  const [dragOverDesk, setDragOverDesk] = useState<"agent" | "my" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("normy_agent");
    if (stored) {
      try { setAgentName(JSON.parse(stored).agentName || "Annie"); } catch {}
    }
  }, []);

  const agentDeskEmails = mockEmails.filter((e) => deskAssignments[e.id] === "agent");
  const myDeskEmails = mockEmails.filter((e) => deskAssignments[e.id] === "my");
  const autoHandledEmails = mockEmails.filter((e) => e.handled && !e.needsAction && deskAssignments[e.id] === "agent");
  const currentEmails = desk === "agent" ? agentDeskEmails : myDeskEmails;

  const moveToDesk = useCallback((emailId: string, targetDesk: "agent" | "my") => {
    setDeskAssignments((prev) => ({ ...prev, [emailId]: targetDesk }));
  }, []);

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

  const openEmail = (email: Email) => {
    setSelectedEmail(email);
    setDraftText(email.agentDraft || "");
    setEditingDraft(false);
  };

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
              <p className="font-medium text-sm truncate">{email.sender}</p>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">{email.time}</span>
            </div>
            <p className="text-sm font-medium mb-1 truncate">{email.subject}</p>
            <p className="text-xs text-muted-foreground truncate">{email.preview}</p>
          </div>
        </div>
      </div>
      {email.agentDraft && (
        <div className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-accent flex items-center justify-center text-accent-foreground text-xs font-bold">
          {agentName.charAt(0)}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b bg-background sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Admin</span>
          </button>
          <h1 className="font-display font-semibold">Email</h1>
          <AppMenu />
        </div>
      </nav>

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
                <div className="bg-card border rounded-xl p-4 mb-6 whitespace-pre-line text-sm">{selectedEmail.body}</div>

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
              className="bg-background w-full max-w-lg rounded-t-2xl p-6"
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
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/30 flex items-center justify-center hover:scale-105 transition-transform z-40"
        >
          <span className="font-display font-bold text-lg">{agentName.charAt(0)}</span>
        </button>
      )}
    </div>
  );
}
