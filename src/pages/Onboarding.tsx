import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";
import { toast } from "@/hooks/use-toast";
import {
  ArrowRight,
  ArrowLeft,
  Mail,
  Calendar,
  Users,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Shield,
  MessageSquare,
  Phone,
  Check,
  Loader2,
} from "lucide-react";

interface OnboardingState {
  agentName: string;
  phoneNumber: string;
  email: boolean;
  calendar: boolean;
  tone: string;
  emailLength: string;
  priorityVisibility: string;
  decisionStyle: string;
}

const defaults: OnboardingState = {
  agentName: "",
  phoneNumber: "",
  email: true,
  calendar: true,
  tone: "friendly",
  emailLength: "balanced",
  priorityVisibility: "important",
  decisionStyle: "careful",
};

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

interface Props {
  onComplete?: () => void;
}

export default function Onboarding({ onComplete }: Props) {
  const navigate = useNavigate();
  const { setAgentName } = useAgent();
  const { integrations } = useIntegrations();
  const { connecting, connect } = useGoogleOAuthPopup();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [state, setState] = useState<OnboardingState>(defaults);
  const [saving, setSaving] = useState(false);

  const totalSteps = 6;
  const progress = ((step + 1) / totalSteps) * 100;

  const gmailConnected = integrations.find((i) => i.id === "gmail")?.connected;
  const calendarConnected = integrations.find((i) => i.id === "google-calendar")?.connected;

  const next = () => { setDir(1); setStep((s) => Math.min(s + 1, totalSteps - 1)); };
  const prev = () => { setDir(-1); setStep((s) => Math.max(s - 1, 0)); };

  const finish = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No session");

      const agentName = state.agentName.trim() || "Normy Agent";

      const { error } = await supabase
        .from("user_preferences")
        .upsert(
          {
            user_id: user.id,
            agent_name: agentName,
            phone_number: state.phoneNumber.trim() || null,
            onboarding_completed: true,
            tone: state.tone,
            email_length: state.emailLength,
            priority_visibility: state.priorityVisibility,
            decision_style: state.decisionStyle,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;

      // Update AgentContext state + localStorage (DB already written above)
      setAgentName(agentName);
      onComplete?.();
      navigate("/mode-select");
    } catch (err) {
      console.error("[Onboarding] finish error", err);
      toast({ title: "Something went wrong", description: "Couldn't save your preferences. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof OnboardingState>(key: K, val: OnboardingState[K]) =>
    setState((s) => ({ ...s, [key]: val }));

  const OptionBtn = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
        selected ? "bg-accent text-accent-foreground border-accent shadow-sm" : "bg-background text-foreground border-border hover:border-accent/50"
      }`}
    >
      {children}
    </button>
  );

  const agentDisplay = state.agentName.trim() || "Normy Agent";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="w-full bg-muted h-1">
        <motion.div className="h-full bg-accent" animate={{ width: `${progress}%` }} transition={{ duration: 0.4 }} />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: "easeInOut" }}
            >
              {/* Step 0: Name agent */}
              {step === 0 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
                      <Sparkles className="w-8 h-8 text-accent" />
                    </div>
                    <h1 className="font-display text-3xl font-bold mb-2">Name your Normy Agent</h1>
                    <p className="text-muted-foreground">Give your agent a name. This is how they'll introduce themselves.</p>
                  </div>
                  <div className="space-y-2">
                    <Input
                      value={state.agentName}
                      onChange={(e) => update("agentName", e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && next()}
                      placeholder="e.g. Normy Agent, Annie, Nova…"
                      className="text-center text-2xl font-display font-semibold h-16 rounded-xl"
                      autoFocus
                    />
                    <p className="text-sm text-muted-foreground text-center">You can always change this in Settings.</p>
                  </div>
                </div>
              )}

              {/* Step 1: What to handle */}
              {step === 1 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">What should {agentDisplay} handle?</h1>
                    <p className="text-muted-foreground">Choose what your agent manages for you.</p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-background border rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Mail className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <p className="font-medium">Email</p>
                          <p className="text-sm text-muted-foreground">Read, prioritize, and draft replies</p>
                        </div>
                      </div>
                      <Switch checked={state.email} onCheckedChange={(v) => update("email", v)} />
                    </div>
                    <div className="flex items-center justify-between bg-background border rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <p className="font-medium">Calendar</p>
                          <p className="text-sm text-muted-foreground">Manage events and scheduling</p>
                        </div>
                      </div>
                      <Switch checked={state.calendar} onCheckedChange={(v) => update("calendar", v)} />
                    </div>
                    {[
                      { name: "HR", icon: Users },
                      { name: "Marketing", icon: BarChart3 },
                      { name: "Bookkeeping", icon: BookOpen },
                    ].map((dept) => (
                      <div key={dept.name} className="flex items-center justify-between bg-muted/50 border border-transparent rounded-xl p-4 opacity-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <dept.icon className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground">{dept.name}</p>
                            <p className="text-sm text-muted-foreground">Coming soon</p>
                          </div>
                        </div>
                        <Switch disabled checked={false} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Phone number */}
              {step === 2 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
                      <Phone className="w-8 h-8 text-accent" />
                    </div>
                    <h1 className="font-display text-3xl font-bold mb-2">Add your phone number</h1>
                    <p className="text-muted-foreground">
                      Save your number now so {agentDisplay} is ready to reach you when SMS launches.
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <span className="text-amber-500 mt-0.5 text-base leading-none">⏳</span>
                    <div>
                      <p className="text-sm font-semibold text-amber-800">SMS is coming soon</p>
                      <p className="text-sm text-amber-700 leading-relaxed">Texting {agentDisplay} isn't available yet. Add your number now and you'll be set the moment it goes live — no action needed later.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Input
                      type="tel"
                      value={state.phoneNumber}
                      onChange={(e) => update("phoneNumber", e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="text-center text-xl font-medium h-14 rounded-xl"
                    />
                    <p className="text-sm text-muted-foreground text-center">Optional — you can add or change this later in Settings.</p>
                  </div>
                  <div className="bg-card border rounded-xl p-5 space-y-2 opacity-60">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-accent" />
                      <p className="text-sm font-semibold">Text {agentDisplay} anytime <span className="text-xs font-normal text-muted-foreground ml-1">(coming soon)</span></p>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      You'll be able to text {agentDisplay} instructions, approvals, or questions — just like messaging a real assistant.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 3: Connect accounts (real OAuth) */}
              {step === 3 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">Connect your accounts</h1>
                    <p className="text-muted-foreground">{agentDisplay} needs access to get to work.</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      {
                        service: "gmail",
                        connected: gmailConnected,
                        label: "Gmail",
                        desc: "Read, triage, and draft email replies",
                        Icon: Mail,
                      },
                      {
                        service: "google-calendar",
                        connected: calendarConnected,
                        label: "Google Calendar",
                        desc: "Prep meetings and manage your schedule",
                        Icon: Calendar,
                      },
                    ].map(({ service, connected, label, desc, Icon }) => (
                      <button
                        key={service}
                        onClick={() => { if (!connected) connect(service).catch(() => {}); }}
                        disabled={!!connected || connecting === service}
                        className={`w-full flex items-center gap-4 rounded-xl px-5 py-4 border transition-all text-left ${
                          connected
                            ? "bg-success/5 border-success/20 cursor-default"
                            : connecting === service
                            ? "bg-card border-accent/30 opacity-80 cursor-wait"
                            : "bg-card border-border hover:border-accent/50 cursor-pointer"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${connected ? "bg-success/10" : "bg-muted/50"}`}>
                          {connected ? (
                            <Check className="w-5 h-5 text-success" />
                          ) : connecting === service ? (
                            <Loader2 className="w-5 h-5 text-accent animate-spin" />
                          ) : (
                            <Icon className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {connected ? `${label} connected` : connecting === service ? "Connecting…" : `Connect ${label}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                        </div>
                        {connected && <CheckCircle2 className="w-5 h-5 text-success shrink-0" />}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground/50">
                    <Shield className="w-4 h-4 shrink-0" />
                    <p className="text-xs">Secure OAuth — your passwords are never shared with us</p>
                  </div>
                </div>
              )}

              {/* Step 4: Communication preferences */}
              {step === 4 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">How should {agentDisplay} communicate?</h1>
                    <p className="text-muted-foreground">Let {agentDisplay} know how you like to operate.</p>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Tone</label>
                      <div className="flex gap-2 flex-wrap">
                        {["direct", "friendly", "formal"].map((t) => (
                          <OptionBtn key={t} selected={state.tone === t} onClick={() => update("tone", t)}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </OptionBtn>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Email length</label>
                      <div className="flex gap-2 flex-wrap">
                        {["short", "balanced", "detailed"].map((t) => (
                          <OptionBtn key={t} selected={state.emailLength === t} onClick={() => update("emailLength", t)}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </OptionBtn>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Show me priorities that are…</label>
                      <div className="flex gap-2 flex-wrap">
                        {["urgent", "important", "all"].map((t) => (
                          <OptionBtn key={t} selected={state.priorityVisibility === t} onClick={() => update("priorityVisibility", t)}>
                            {t === "urgent" ? "Only urgent" : t.charAt(0).toUpperCase() + t.slice(1)}
                          </OptionBtn>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Decision style</label>
                      <div className="flex gap-2 flex-wrap">
                        {["fast", "careful"].map((t) => (
                          <OptionBtn key={t} selected={state.decisionStyle === t} onClick={() => update("decisionStyle", t)}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </OptionBtn>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5: Done */}
              {step === 5 && (
                <div className="space-y-10">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">You're all set!</h1>
                    <p className="text-muted-foreground">Here's how {agentDisplay} works.</p>
                  </div>
                  <div className="space-y-6">
                    {[
                      { icon: Mail, title: `${agentDisplay} reviews everything`, desc: "Every email and event is read, classified, and organized." },
                      { icon: Shield, title: "You stay in control", desc: "Nothing is sent without your approval. You always have the final say." },
                      { icon: MessageSquare, title: `Just tell ${agentDisplay} what to do`, desc: "Type, text, or speak to your agent anytime. It's like texting your assistant." },
                    ].map((item, i) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.15, duration: 0.5 }}
                        className="flex items-start gap-4 bg-card border rounded-xl p-5"
                      >
                        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                          <item.icon className="w-5 h-5 text-accent" />
                        </div>
                        <div>
                          <h3 className="font-display font-semibold mb-1">{item.title}</h3>
                          <p className="text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-10">
            {step > 0 ? (
              <Button variant="ghost" onClick={prev} size="sm" disabled={saving}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            ) : (
              <div />
            )}
            {step < totalSteps - 1 ? (
              <Button onClick={next} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {step === 3 && !gmailConnected && !calendarConnected ? "Skip for now" : "Continue"}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {saving ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</>
                ) : (
                  <>Go to my desk <ArrowRight className="w-4 h-4 ml-1" /></>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
