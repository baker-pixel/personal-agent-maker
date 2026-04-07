import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, ArrowLeft, Mail, Calendar, Users, BarChart3, BookOpen, CheckCircle2, AlertTriangle, Sparkles, Shield, MessageSquare, Phone } from "lucide-react";

interface OnboardingState {
  agentName: string;
  phoneNumber: string;
  email: boolean;
  calendar: boolean;
  gmailConnected: boolean;
  calendarConnected: boolean;
  tone: string;
  emailLength: string;
  priorityVisibility: string;
  decisionStyle: string;
  autonomy: string;
}

const defaults: OnboardingState = {
  agentName: "Annie",
  phoneNumber: "",
  email: true,
  calendar: true,
  gmailConnected: false,
  calendarConnected: false,
  tone: "friendly",
  emailLength: "balanced",
  priorityVisibility: "important",
  decisionStyle: "careful",
  autonomy: "review",
};

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
};

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [state, setState] = useState<OnboardingState>(defaults);

  const totalSteps = 6;
  const progress = ((step + 1) / totalSteps) * 100;

  const next = () => { setDir(1); setStep((s) => Math.min(s + 1, totalSteps - 1)); };
  const prev = () => { setDir(-1); setStep((s) => Math.max(s - 1, 0)); };
  const finish = () => {
    localStorage.setItem("normy_agent", JSON.stringify(state));
    navigate("/mode-select");
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
                      placeholder="Annie"
                      className="text-center text-2xl font-display font-semibold h-16 rounded-xl"
                    />
                    <p className="text-sm text-muted-foreground text-center">You can always change this later.</p>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">What should {state.agentName} handle?</h1>
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

              {step === 2 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
                      <Phone className="w-8 h-8 text-accent" />
                    </div>
                    <h1 className="font-display text-3xl font-bold mb-2">Add your phone number</h1>
                    <p className="text-muted-foreground">
                      Your primary interactions with {state.agentName} are designed to be on the go. Add your phone so {state.agentName} can recognize you when you text.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Input
                      type="tel"
                      value={state.phoneNumber}
                      onChange={(e) => update("phoneNumber", e.target.value)}
                      placeholder="+1 (555) 123-4567"
                      className="text-center text-xl font-medium h-14 rounded-xl"
                    />
                    <p className="text-sm text-muted-foreground text-center">
                      This is how {state.agentName} knows it's you via SMS and voice.
                    </p>
                  </div>
                  <div className="bg-card border rounded-xl p-5 space-y-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-accent" />
                      <p className="text-sm font-semibold">Text {state.agentName} anytime</p>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Once connected, you can text {state.agentName} instructions, approvals, or questions — just like messaging a real assistant.
                    </p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">Connect your accounts</h1>
                    <p className="text-muted-foreground">{state.agentName} needs access to get to work.</p>
                  </div>
                  <div className="space-y-3">
                    <button
                      onClick={() => update("gmailConnected", !state.gmailConnected)}
                      className={`w-full flex items-center justify-between border rounded-xl p-4 transition-all ${
                        state.gmailConnected ? "bg-success/5 border-success/30" : "bg-background hover:border-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Mail className="w-5 h-5 text-accent" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">Gmail / Outlook</p>
                          <p className="text-sm text-muted-foreground">Connect your email provider</p>
                        </div>
                      </div>
                      {state.gmailConnected ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <span className="text-sm text-accent font-medium">Connect</span>
                      )}
                    </button>
                    <button
                      onClick={() => update("calendarConnected", !state.calendarConnected)}
                      className={`w-full flex items-center justify-between border rounded-xl p-4 transition-all ${
                        state.calendarConnected ? "bg-success/5 border-success/30" : "bg-background hover:border-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                          <Calendar className="w-5 h-5 text-accent" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">Calendar</p>
                          <p className="text-sm text-muted-foreground">Auto-connects with same provider</p>
                        </div>
                      </div>
                      {state.calendarConnected ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <span className="text-sm text-accent font-medium">Connect</span>
                      )}
                    </button>
                  </div>
                  {!state.gmailConnected && !state.calendarConnected && (
                    <div className="flex items-start gap-3 bg-priority-important/10 border border-priority-important/20 rounded-xl p-4">
                      <AlertTriangle className="w-5 h-5 text-priority-important shrink-0 mt-0.5" />
                      <p className="text-sm">Your agent can't help until accounts are connected. You can skip for now and connect later.</p>
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">How should {state.agentName} communicate?</h1>
                    <p className="text-muted-foreground">Let {state.agentName} know how you like to operate.</p>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Tone</label>
                      <div className="flex gap-2">
                        {["direct", "friendly", "formal"].map((t) => (
                          <OptionBtn key={t} selected={state.tone === t} onClick={() => update("tone", t)}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </OptionBtn>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Email length</label>
                      <div className="flex gap-2">
                        {["short", "balanced", "detailed"].map((t) => (
                          <OptionBtn key={t} selected={state.emailLength === t} onClick={() => update("emailLength", t)}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </OptionBtn>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Show me priorities that are…</label>
                      <div className="flex gap-2">
                        {["urgent", "important", "all"].map((t) => (
                          <OptionBtn key={t} selected={state.priorityVisibility === t} onClick={() => update("priorityVisibility", t)}>
                            {t === "urgent" ? "Only urgent" : t.charAt(0).toUpperCase() + t.slice(1)}
                          </OptionBtn>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Decision style</label>
                      <div className="flex gap-2">
                        {["fast", "careful"].map((t) => (
                          <OptionBtn key={t} selected={state.decisionStyle === t} onClick={() => update("decisionStyle", t)}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </OptionBtn>
                        ))}
                      </div>
                    </div>
                    <div className="bg-card border rounded-xl p-5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-accent" />
                        <label className="text-sm font-semibold">Personality Syncing</label>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        One of Normy's breakthrough innovations is the world's first behavioral intelligence engine, called <span className="font-semibold text-foreground">Bintly</span>. By completing our simple proprietary personality assessment, {state.agentName} will understand your communication preferences.
                      </p>
                      <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90 mt-1">
                        Take the Assessment <ArrowRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-10">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">You're all set!</h1>
                    <p className="text-muted-foreground">Here's how {state.agentName} works.</p>
                  </div>
                  <div className="space-y-6">
                    {[
                      { icon: Mail, title: `${state.agentName} reviews everything`, desc: "Every email and event is read, classified, and organized." },
                      { icon: Shield, title: "You stay in control", desc: "Nothing is sent without your approval. You always have the final say." },
                      { icon: MessageSquare, title: `Just tell ${state.agentName} what to do`, desc: "Type, text, or speak to your agent anytime. It's like texting your assistant." },
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
              <Button variant="ghost" onClick={prev} size="sm">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>
            ) : (
              <div />
            )}
            {step < totalSteps - 1 ? (
              <Button onClick={next} className="bg-accent text-accent-foreground hover:bg-accent/90">
                Continue <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={finish} className="bg-accent text-accent-foreground hover:bg-accent/90">
                Go to my desk <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
