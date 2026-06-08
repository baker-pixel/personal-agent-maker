import { useState, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAgent } from "@/contexts/AgentContext";
import { useIntegrations } from "@/contexts/IntegrationsContext";
import { useGoogleOAuthPopup } from "@/hooks/useGoogleOAuthPopup";
import { toast } from "@/hooks/use-toast";
import {
  ArrowRight, ArrowLeft, Mail, Calendar,
  CheckCircle2, Sparkles, Shield, MessageSquare,
  Check, Loader2, Zap, Volume2, Brain,
} from "lucide-react";
import { GROQ_VOICES, DEFAULT_GROQ_VOICE } from "@/lib/groqVoices";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingState {
  agentName: string;
  voiceId: string;
  tone: string;
  emailLength: string;
  priorityVisibility: string;
  decisionStyle: string;
  assessFirstName: string;
  assessLastName: string;
  assessEmail: string;
}

const defaults: OnboardingState = {
  agentName: "",
  voiceId: DEFAULT_GROQ_VOICE,
  tone: "friendly",
  emailLength: "balanced",
  priorityVisibility: "important",
  decisionStyle: "careful",
  assessFirstName: "",
  assessLastName: "",
  assessEmail: "",
};

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

interface Props { onComplete?: () => void; }

const TOTAL_STEPS = 6;
const ASSESSMENT_RETURN_STEP = 4;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Onboarding({ onComplete }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAgentName } = useAgent();
  const { integrations, integrationsLoading } = useIntegrations();
  const { connecting, connect } = useGoogleOAuthPopup();

  const [assessmentDone, setAssessmentDone] = useState(false);
  const [assessmentLoading, setAssessmentLoading] = useState(false);

  // Resume at step 4 when returning from assessment redirect
  const resumeStep = parseInt(searchParams.get("resumeStep") ?? "0", 10);

  // Step and form state start at defaults — restored from user-scoped localStorage after auth loads
  const [step, setStep] = useState<number>(resumeStep > 0 ? resumeStep : 0);
  const [dir, setDir] = useState(1);
  const [state, setState] = useState<OnboardingState>(defaults);
  const [saving, setSaving] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  // Wait for IntegrationsContext to finish loading before reading connection state.
  // Without this, step 4 would flash "not connected" even for already-connected accounts.
  const gmailConnected = !integrationsLoading && integrations.find(i => i.id === "gmail")?.connected;
  const calendarConnected = !integrationsLoading && integrations.find(i => i.id === "google-calendar")?.connected;

  useEffect(() => {
    // getSession reads from localStorage — fast, no network
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const u = session.user;
      const key = `onboarding_progress_${u.id}`;
      setStorageKey(key);

      // 1. Restore localStorage progress for this user
      let savedStep = resumeStep > 0 ? resumeStep : 0;
      let savedState: Partial<OnboardingState> = {};
      if (resumeStep === 0) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as { step?: number; state?: Partial<OnboardingState> };
            if (typeof parsed.step === "number") savedStep = parsed.step;
            if (parsed.state) savedState = parsed.state;
          }
        } catch { /* ignore */ }
      }

      // 2. Pre-fill assessment fields from auth — only if not already saved
      const authEmail = u.email ?? "";
      const fullName = (u.user_metadata?.full_name || u.user_metadata?.name || "").trim();
      const idx = fullName.indexOf(" ");
      const authFirst = idx > 0 ? fullName.slice(0, idx) : fullName;
      const authLast  = idx > 0 ? fullName.slice(idx + 1) : "";

      setState({
        ...defaults,
        ...savedState,
        assessEmail:     savedState.assessEmail     || authEmail,
        assessFirstName: savedState.assessFirstName || authFirst,
        assessLastName:  savedState.assessLastName  || authLast,
      });
      if (savedStep > 0) setStep(savedStep);

      // 3. Security check (getUser = server-side JWT verify) + DB prefs
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) {
          toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
          supabase.auth.signOut();
          return;
        }
        supabase
          .from("user_preferences")
          .select("onboarding_completed, assessment_status, user_display_name, onboarding_step, agent_name, tone, email_length, priority_visibility, decision_style, tts_elevenlabs_voice_id")
          .eq("user_id", user.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data?.onboarding_completed) {
              localStorage.removeItem(key);
              onComplete?.();
              return;
            }
            if (data?.assessment_status === "success") setAssessmentDone(true);

            // DB step as floor — never go backwards from what was saved
            const dbStep = data?.onboarding_step ?? 0;
            if (resumeStep === 0 && dbStep > 0) setStep(s => Math.max(s, dbStep));

            // Fill DB values as fallback for fields not yet in localStorage
            setState(s => {
              const dbName = (data?.user_display_name || "").trim();
              const di = dbName.indexOf(" ");
              return {
                ...s,
                agentName:        s.agentName        || data?.agent_name || "",
                voiceId:          s.voiceId          || data?.tts_elevenlabs_voice_id || DEFAULT_GROQ_VOICE,
                tone:             s.tone             || data?.tone              || "friendly",
                emailLength:      s.emailLength      || data?.email_length      || "balanced",
                priorityVisibility: s.priorityVisibility || data?.priority_visibility || "important",
                decisionStyle:    s.decisionStyle    || data?.decision_style    || "careful",
                assessFirstName:  s.assessFirstName  || (di > 0 ? dbName.slice(0, di) : dbName),
                assessLastName:   s.assessLastName   || (di > 0 ? dbName.slice(di + 1) : ""),
              };
            });
          });
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist step + form data under the user-scoped key
  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ step, state }));
  }, [step, state, storageKey]);

  // Auto-advance when IntegrationsContext confirms connected (live connection case)
  useEffect(() => {
    if (step === 4 && gmailConnected) {
      setDir(1);
      setStep(5);
    }
  }, [gmailConnected, step]);

  // Direct DB check once user identity is known — guards against the race where
  // IntegrationsContext resolves before localStorage restores step=4, causing
  // the effect above to fire with step=0 and miss. This fires whenever step
  // settles at 4 with a known user, and advances to 5 if the grant exists.
  useEffect(() => {
    if (step !== 4 || !storageKey) return;
    supabase
      .from("nylas_grants")
      .select("id")
      .eq("provider", "google")
      .limit(1)
      .then(({ data }) => {
        if (data?.length) {
          setDir(1);
          setStep(5);
        }
      });
  }, [step, storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = <K extends keyof OnboardingState>(key: K, val: OnboardingState[K]) =>
    setState(s => ({ ...s, [key]: val }));

  const goToStep = (n: number) => { setStep(n); };

  const saveStepToDB = async (completedStep: number, currentState: OnboardingState) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const agentName = currentState.agentName.trim() || "Normy Agent";
      const updates: Record<string, any> = {
        user_id: session.user.id,
        onboarding_step: completedStep + 1,
        updated_at: new Date().toISOString(),
      };
      if (completedStep >= 0) updates.agent_name = agentName;
      if (completedStep >= 1) {
        updates.tts_elevenlabs_voice_id = currentState.voiceId;
        updates.tts_provider = "groq";
        updates.tts_enabled = true;
      }
      if (completedStep >= 2) {
        updates.tone = currentState.tone;
        updates.email_length = currentState.emailLength;
        updates.priority_visibility = currentState.priorityVisibility;
        updates.decision_style = currentState.decisionStyle;
      }
      await supabase.from("user_preferences").upsert(updates, { onConflict: "user_id" });
    } catch (err) {
      console.warn("[Onboarding] saveStepToDB failed:", err);
    }
  };

  const next = () => {
    const resolvedState = step === 0 && !state.agentName.trim()
      ? { ...state, agentName: "Normy Agent" }
      : state;
    if (step === 0 && !state.agentName.trim()) setState(resolvedState);
    saveStepToDB(step, resolvedState); // fire-and-forget DB save
    setDir(1);
    goToStep(Math.min(step + 1, TOTAL_STEPS - 1));
  };
  const prev = () => { setDir(-1); goToStep(Math.max(step - 1, 0)); };

  const finish = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Session expired", description: "Please sign in again.", variant: "destructive" });
        navigate("/auth");
        return;
      }

      const agentName = state.agentName.trim() || "Normy Agent";

      const { error } = await supabase
        .from("user_preferences")
        .upsert({
          user_id: user.id,
          agent_name: agentName,
          onboarding_completed: true,
          tone: state.tone,
          email_length: state.emailLength,
          priority_visibility: state.priorityVisibility,
          decision_style: state.decisionStyle,
          tts_elevenlabs_voice_id: state.voiceId, // column reused for groq voice id
          tts_provider: "groq",
          tts_enabled: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;

      // Update agent name in context immediately
      setAgentName(agentName);

      // Kick off email triage in the background if Gmail is connected
      if (gmailConnected) {
        supabase.functions.invoke("email-triage", { body: {} }).catch(() => {});
      }

      if (storageKey) localStorage.removeItem(storageKey);

      // Signal parent (App.tsx) that onboarding is done — sets isOnboarded = true.
      // The /onboarding route guard then renders <Navigate to="/mode-select" /> automatically.
      // Do NOT call navigate() here — calling it before React commits setIsOnboarded(true)
      // causes ProtectedRoute to see isOnboarded=false and redirect back to /onboarding.
      onComplete?.();
    } catch (err: any) {
      console.error("[Onboarding] finish error", err);
      toast({
        title: "Couldn't save your setup",
        description: err?.message || "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const OptionBtn = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
        selected
          ? "bg-accent text-accent-foreground border-accent shadow-sm"
          : "bg-background text-foreground border-border hover:border-accent/50 hover:bg-accent/5"
      }`}
    >
      {children}
    </button>
  );

  const agentDisplay = state.agentName.trim() || "your agent";

  const getContinueLabel = () => step === 3 ? "Skip" : "Continue";

  const previewVoice = async (voiceId: string) => {
    // Abort any in-flight request so we don't fire multiple concurrent fetches
    if (previewAbortRef.current) {
      previewAbortRef.current.abort();
      previewAbortRef.current = null;
    }
    // Stop any playing audio and free the blob URL
    if (previewAudioRef.current) {
      previewAudioRef.current.onended = null;
      previewAudioRef.current.onerror = null;
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }

    const name = state.agentName.trim() || "your agent";
    const text = `Hi, I'm ${name}, your personal assistant. Ready to help you take on the day.`;
    setPreviewingVoiceId(voiceId);

    const abort = new AbortController();
    previewAbortRef.current = abort;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
      const anonKey = (import.meta as any).env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const res = await fetch(`${supabaseUrl}/functions/v1/groq-tts`, {
        method: "POST",
        signal: abort.signal,
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${session?.access_token ?? anonKey}`,
        },
        body: JSON.stringify({ text, voice: voiceId, speed: 1.0 }),
      });

      if (abort.signal.aborted) return;

      if (res.status === 429) {
        toast({ title: "Too many previews", description: "Please wait a moment before previewing again.", variant: "destructive" });
        setPreviewingVoiceId(null);
        return;
      }
      if (!res.ok) throw new Error(`${res.status}`);

      const blob = await res.blob();
      if (abort.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      const cleanup = () => { setPreviewingVoiceId(null); URL.revokeObjectURL(url); previewUrlRef.current = null; };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setPreviewingVoiceId(null);
      toast({ title: "Preview unavailable", description: "Voice API key not configured yet.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      <div className="w-full bg-muted h-1 shrink-0">
        <motion.div
          className="h-full bg-accent"
          animate={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Step dots */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-2 shrink-0">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i === step
                ? "w-6 h-2 bg-accent"
                : i < step
                ? "w-2 h-2 bg-accent/40"
                : "w-2 h-2 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 pt-4">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {/* ── Step 0: Name ─────────────────────────────────────────── */}
              {step === 0 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
                      <Sparkles className="w-8 h-8 text-accent" />
                    </div>
                    <h1 className="font-display text-3xl font-bold mb-2">Meet your AI assistant</h1>
                    <p className="text-muted-foreground leading-relaxed">
                      Give your agent a name — they'll use it when they introduce themselves in emails and messages.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Input
                      value={state.agentName}
                      onChange={e => update("agentName", e.target.value)}
                      onKeyDown={e => e.key === "Enter" && next()}
                      placeholder="e.g. Alex, Sage, Max…"
                      className="text-center text-2xl font-display font-semibold h-16 rounded-2xl"
                      autoFocus
                    />
                    <p className="text-sm text-muted-foreground text-center">
                      You can change this anytime in Settings.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Step 1: Voice selection ───────────────────────────────── */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6">
                      <Volume2 className="w-8 h-8 text-accent" />
                    </div>
                    <h1 className="font-display text-3xl font-bold mb-2">Pick {agentDisplay}'s voice</h1>
                    <p className="text-muted-foreground leading-relaxed">
                      Choose how your agent sounds. Hit play to preview.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                    {GROQ_VOICES.map(v => {
                      const selected = state.voiceId === v.id;
                      const previewing = previewingVoiceId === v.id;
                      return (
                        <div
                          key={v.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => update("voiceId", v.id)}
                          onKeyDown={e => e.key === "Enter" && update("voiceId", v.id)}
                          className={`relative text-left rounded-2xl border p-3.5 transition-all cursor-pointer ${
                            selected
                              ? "border-accent bg-accent/10 shadow-sm"
                              : "border-border bg-card hover:border-accent/40 hover:bg-accent/[0.02]"
                          }`}
                        >
                          <p className={`text-sm font-semibold leading-tight ${selected ? "text-accent" : "text-foreground"}`}>
                            {v.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{v.description}</p>
                          <button
                            onClick={e => { e.stopPropagation(); previewVoice(v.id); }}
                            className={`mt-2.5 flex items-center gap-1 text-[11px] font-medium transition-colors ${
                              previewing ? "text-accent" : "text-muted-foreground hover:text-accent"
                            }`}
                          >
                            <Volume2 className={`w-3 h-3 ${previewing ? "animate-pulse" : ""}`} />
                            {previewing ? "Playing…" : "Preview"}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[11px] text-muted-foreground text-center">
                    Browser preview only — full premium voice activates in the app. Change anytime in Settings.
                  </p>
                </div>
              )}

              {/* ── Step 3: Personality assessment ───────────────────────── */}
              {step === 3 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${assessmentDone ? "bg-green-500/10" : "bg-accent/10"}`}>
                      {assessmentDone
                        ? <CheckCircle2 className="w-8 h-8 text-green-600" />
                        : <Brain className="w-8 h-8 text-accent" />}
                    </div>
                    <h1 className="font-display text-3xl font-bold mb-2">
                      {assessmentDone ? "Assessment complete!" : `Teach ${agentDisplay} your personality!`}
                    </h1>
                    {assessmentDone && (
                      <p className="text-muted-foreground text-sm">Assessment already completed. Continue to finish setup.</p>
                    )}
                  </div>

                  {!assessmentDone && (
                    <>
                      <div className="space-y-4 text-muted-foreground leading-relaxed text-sm">
                        <p>
                          One of the most innovative aspects of {agentDisplay} is that we've built in the ability to understand your personality, your communication style, work preferences, your tone, pace. Just like any good personal assistant, getting to "know" you is vital for a strong relationship.
                        </p>
                        <p>
                          Take our proprietary personality assessment now (3–5 minutes) and help {agentDisplay} work your way.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">First name</label>
                            <Input
                              value={state.assessFirstName}
                              onChange={e => update("assessFirstName", e.target.value)}
                              placeholder="Jane"
                              className="rounded-xl"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">Last name <span className="text-destructive">*</span></label>
                            <Input
                              value={state.assessLastName}
                              onChange={e => update("assessLastName", e.target.value)}
                              placeholder="Doe"
                              className="rounded-xl"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground">Email</label>
                          <Input
                            value={state.assessEmail}
                            onChange={e => update("assessEmail", e.target.value)}
                            type="email"
                            className="rounded-xl bg-muted/40"
                          />
                        </div>
                      </div>

                      <Button
                        disabled={assessmentLoading || !state.assessLastName.trim()}
                        onClick={async () => {
                          if (!state.assessLastName.trim()) {
                            toast({ title: "Last name required", description: "Please enter your last name.", variant: "destructive" });
                            return;
                          }
                          setAssessmentLoading(true);
                          try {
                            const { data, error } = await supabase.functions.invoke("assessment-proxy", {
                              body: {
                                first_name: state.assessFirstName.trim(),
                                last_name: state.assessLastName.trim(),
                                email: state.assessEmail.trim(),
                              },
                            });
                            if (error) throw new Error(error.message);
                            if (data?.already_completed) {
                              setAssessmentDone(true);
                              setAssessmentLoading(false);
                              return;
                            }
                            if (data?.error) throw new Error(data.error);
                            if (!data?.assessment_url) throw new Error("No assessment URL returned");
                            window.location.href = data.assessment_url;
                          } catch (err: any) {
                            toast({ title: "Couldn't start assessment", description: err?.message || "Please try again.", variant: "destructive" });
                            setAssessmentLoading(false);
                          }
                        }}
                        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl h-12 text-sm font-semibold shadow-lg shadow-accent/25"
                      >
                        {assessmentLoading
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Starting assessment…</>
                          : <>Take the Personality Assessment <ArrowRight className="w-4 h-4 ml-1.5" /></>}
                      </Button>

                      <p className="text-xs text-muted-foreground text-center">
                        3–5 minutes — you'll be brought back here automatically when done.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* ── Step 4: Connect accounts ──────────────────────────────── */}
              {step === 4 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">Connect your accounts</h1>
                    <p className="text-muted-foreground">
                      {agentDisplay.charAt(0).toUpperCase() + agentDisplay.slice(1)} needs access to your email and calendar to get to work.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Skeleton while loading */}
                    {integrationsLoading && (
                      <div className="flex items-center gap-4 rounded-2xl px-5 py-4 border bg-card animate-pulse">
                        <div className="w-11 h-11 rounded-xl bg-muted shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3.5 bg-muted rounded w-1/3" />
                          <div className="h-2.5 bg-muted rounded w-2/3" />
                        </div>
                      </div>
                    )}

                    {!integrationsLoading && (() => {
                      const connected = gmailConnected || calendarConnected;
                      const connecting_ = connecting === "gmail";
                      return (
                        <button
                          onClick={() => { if (!connected) connect("gmail").catch(() => {}); }}
                          disabled={connected || connecting_}
                          className={`w-full flex items-center gap-4 rounded-2xl px-5 py-4 border transition-all text-left ${
                            connected
                              ? "bg-green-500/5 border-green-500/20 cursor-default"
                              : connecting_
                              ? "bg-card border-accent/30 opacity-80 cursor-wait"
                              : "bg-card border-border hover:border-accent/50 hover:bg-accent/[0.02] cursor-pointer active:scale-[0.99]"
                          }`}
                        >
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            connected ? "bg-green-500/10" : "bg-muted/60"
                          }`}>
                            {connected
                              ? <Check className="w-5 h-5 text-green-600" />
                              : connecting_
                              ? <Loader2 className="w-5 h-5 text-accent animate-spin" />
                              : <Mail className="w-5 h-5 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              {connected ? "Google Account connected" : connecting_ ? "Connecting…" : "Connect Google Account (Gmail & Calendar)"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              {connected ? "Gmail + Calendar access granted" : "Grants access to Gmail + Calendar in one step"}
                            </p>
                          </div>
                          {connected
                            ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                            : <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
                        </button>
                      );
                    })()}
                  </div>

                  {/* Privacy / trust messaging */}
                  <div className="rounded-2xl bg-muted/40 border border-border/40 px-4 py-3 space-y-2">
                    {[
                      { icon: Shield, text: "We never store your password — Google handles sign-in directly." },
                      { icon: CheckCircle2, text: "Your emails stay private. We only read what's needed to help you." },
                      { icon: ArrowRight, text: "Nothing is sent on your behalf without your approval first." },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-start gap-2.5">
                        <Icon className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 2: Preferences ──────────────────────────────────── */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="text-center">
                    <h1 className="font-display text-3xl font-bold mb-2">How should {agentDisplay} work?</h1>
                    <p className="text-muted-foreground">Fine-tune how your agent communicates and prioritizes.</p>
                  </div>

                  <div className="space-y-5">
                    <div className="bg-card border rounded-2xl p-5 space-y-4">
                      <div>
                        <label className="text-sm font-semibold mb-1.5 block">Tone when drafting</label>
                        <p className="text-xs text-muted-foreground mb-2">How should your agent write emails on your behalf?</p>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { key: "direct", label: "Direct", sub: "Clear, no fluff" },
                            { key: "friendly", label: "Friendly", sub: "Warm and approachable" },
                            { key: "formal", label: "Formal", sub: "Professional and structured" },
                          ].map(t => (
                            <button
                              key={t.key}
                              onClick={() => update("tone", t.key)}
                              className={`flex-1 min-w-[80px] py-3 px-3 rounded-xl border text-center transition-all ${
                                state.tone === t.key
                                  ? "bg-accent text-accent-foreground border-accent"
                                  : "bg-background border-border hover:border-accent/40"
                              }`}
                            >
                              <p className="text-sm font-semibold">{t.label}</p>
                              <p className={`text-[10px] mt-0.5 ${state.tone === t.key ? "text-accent-foreground/70" : "text-muted-foreground"}`}>{t.sub}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-semibold mb-1.5 block">Email length</label>
                        <div className="flex gap-2 flex-wrap">
                          {["short", "balanced", "detailed"].map(t => (
                            <OptionBtn key={t} selected={state.emailLength === t} onClick={() => update("emailLength", t)}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </OptionBtn>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-card border rounded-2xl p-5 space-y-4">
                      <div>
                        <label className="text-sm font-semibold mb-1.5 block">Show me emails that are…</label>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { key: "urgent", label: "Only urgent" },
                            { key: "important", label: "Important" },
                            { key: "all", label: "Everything" },
                          ].map(t => (
                            <OptionBtn key={t.key} selected={state.priorityVisibility === t.key} onClick={() => update("priorityVisibility", t.key)}>
                              {t.label}
                            </OptionBtn>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-semibold mb-1.5 block">Decision style</label>
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { key: "fast", label: "Move fast", sub: "Bias toward action" },
                            { key: "careful", label: "Be careful", sub: "Verify before acting" },
                          ].map(t => (
                            <button
                              key={t.key}
                              onClick={() => update("decisionStyle", t.key)}
                              className={`flex-1 py-3 px-3 rounded-xl border text-center transition-all ${
                                state.decisionStyle === t.key
                                  ? "bg-accent text-accent-foreground border-accent"
                                  : "bg-background border-border hover:border-accent/40"
                              }`}
                            >
                              <p className="text-sm font-semibold">{t.label}</p>
                              <p className={`text-[10px] mt-0.5 ${state.decisionStyle === t.key ? "text-accent-foreground/70" : "text-muted-foreground"}`}>{t.sub}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Step 5: Done ──────────────────────────────────────────── */}
              {step === 5 && (
                <div className="space-y-8">
                  <div className="text-center">
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", damping: 16, stiffness: 200, delay: 0.1 }}
                      className="w-20 h-20 rounded-3xl bg-accent flex items-center justify-center mx-auto mb-6 shadow-lg shadow-accent/30"
                    >
                      <Zap className="w-10 h-10 text-accent-foreground" />
                    </motion.div>
                    <h1 className="font-display text-3xl font-bold mb-2">
                      {agentDisplay.charAt(0).toUpperCase() + agentDisplay.slice(1)} is ready
                    </h1>
                    <p className="text-muted-foreground">
                      Your AI assistant is set up and watching your back.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {[
                      {
                        icon: Mail,
                        title: `${agentDisplay.charAt(0).toUpperCase() + agentDisplay.slice(1)} reads and triages everything`,
                        desc: "Urgent emails surface at the top. Newsletter clutter stays out of your way.",
                        delay: 0.1,
                      },
                      {
                        icon: Calendar,
                        title: "Meeting prep on autopilot",
                        desc: "Get briefed before every call — attendees, context, and talking points.",
                        delay: 0.2,
                      },
                      {
                        icon: Shield,
                        title: "You stay in control",
                        desc: "Nothing is sent without your approval. Every action goes through you first.",
                        delay: 0.3,
                      },
                      {
                        icon: MessageSquare,
                        title: "Chat anytime",
                        desc: `Ask ${agentDisplay} to draft emails, plan your day, or handle anything else — right in the chat.`,
                        delay: 0.4,
                      },
                    ].map((item, i) => (
                      <motion.div
                        key={item.title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: item.delay, duration: 0.4, ease: "easeOut" }}
                        className="flex items-start gap-4 bg-card border rounded-2xl p-4"
                      >
                        <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                          <item.icon className="w-4.5 h-4.5 text-accent" style={{ width: "1.125rem", height: "1.125rem" }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {step > 0 ? (
              <Button variant="ghost" onClick={prev} size="sm" disabled={saving} className="text-muted-foreground">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            ) : (
              <div />
            )}

            {step < TOTAL_STEPS - 1 ? (
              <Button
                onClick={next}
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl px-6"
              >
                {getContinueLabel()}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={finish}
                disabled={saving}
                className="bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl px-6 shadow-lg shadow-accent/25"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Setting up…</>
                  : <>Go to my dashboard <ArrowRight className="w-4 h-4 ml-1" /></>}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
