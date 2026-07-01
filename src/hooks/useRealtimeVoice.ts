import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVoicePreferences } from "./useVoicePreferences";
import { sonicToGroqVoiceId } from "@/lib/sonicVoices";

const READ_TOOLS = new Set(["read_email", "get_inbox", "get_calendar", "search_contacts", "get_tasks"]);

export const realtimeEnabled = (): boolean =>
  typeof import.meta.env.VITE_OPENAI_REALTIME === "string" &&
  import.meta.env.VITE_OPENAI_REALTIME.length > 0;

interface UseRealtimeVoiceOpts {
  agentName?: string;
  onTranscript?: (role: "USER" | "ASSISTANT", text: string) => void;
  onToolEvent?: (e: { name: string; phase: "start" | "done"; success?: boolean; message?: string }) => void;
  onAutoEnd?: () => void;
}

export function useRealtimeVoice(opts: UseRealtimeVoiceOpts = {}) {
  const [conversationActive, setConversationActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessingTool, setIsProcessingTool] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { prefs: voicePrefs, loaded: prefsLoaded, update: updateVoicePrefs } = useVoicePreferences();
  const voiceIdRef = useRef(voicePrefs.sonic_voice_id);
  const prefsLoadedRef = useRef(prefsLoaded);
  useEffect(() => { voiceIdRef.current = voicePrefs.sonic_voice_id; }, [voicePrefs.sonic_voice_id]);
  useEffect(() => { prefsLoadedRef.current = prefsLoaded; }, [prefsLoaded]);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  const sessionIdRef = useRef(0);
  const pendingActionRef = useRef<{ name: string; args: Record<string, unknown> } | null>(null);
  // Track which call_ids we've already handled to prevent double-execution
  // (function calls can arrive in both response.output_item.done and response.done).
  const handledCallsRef = useRef<Set<string>>(new Set());
  const lastFailRef = useRef(0);
  const sessionTzRef = useRef("UTC");

  const pendingOnboardingRef = useRef(false);
  const outputBufferActiveRef = useRef(false);
  const greetingTriggeredRef = useRef(false);
  const echoUnmuteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startupStage, setStartupStage] = useState<string | null>(null);
  const [startupElapsedMs, setStartupElapsedMs] = useState(0);
  const startupStartRef = useRef(0);
  const startupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });

  const sendDc = useCallback((event: unknown) => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify(event));
    }
  }, []);

  const replyWithToolResult = useCallback((callId: string, result: unknown) => {
    sendDc({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) },
    });
    sendDc({ type: "response.create" });
  }, [sendDc]);

  const callVoiceTools = useCallback(async (name: string, args: Record<string, unknown>) => {
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("voice-tools", {
        body: { name, args, tz: sessionTzRef.current },
      });
      if (fnErr) throw fnErr;
      return data || { success: false, message: "Tool returned no data." };
    } catch (e: any) {
      console.error("[RealtimeVoice] tool", name, "failed:", e?.message);
      return { success: false, message: "The action failed — please try again." };
    }
  }, []);

  const handleToolCall = useCallback(async (name: string, callId: string, argsStr: string) => {
    // Deduplicate — the same call can arrive in both output_item.done and response.done.
    if (handledCallsRef.current.has(callId)) return;
    handledCallsRef.current.add(callId);

    let args: Record<string, unknown> = {};
    try { args = JSON.parse(argsStr || "{}"); } catch { /* bad JSON */ }

    optsRef.current.onToolEvent?.({ name, phase: "start" });

    if (name === "confirm_action") {
      if (!pendingActionRef.current) {
        replyWithToolResult(callId, {
          success: true,
          message: "Nothing is lined up right now — respond naturally. Do NOT say you cannot execute anything.",
        });
        return;
      }
      const { name: actionName, args: actionArgs } = pendingActionRef.current;
      pendingActionRef.current = null;
      setIsProcessingTool(true);
      const result = await callVoiceTools(actionName, actionArgs);
      setIsProcessingTool(false);
      optsRef.current.onToolEvent?.({ name: actionName, phase: "done", success: !!result.success, message: result.message });
      replyWithToolResult(callId, result);
      return;
    }

    if (name === "cancel_action") {
      const had = pendingActionRef.current?.name;
      pendingActionRef.current = null;
      replyWithToolResult(callId, { success: true, message: had ? `${had} cancelled. Acknowledge briefly.` : "Nothing was pending." });
      return;
    }

    if (READ_TOOLS.has(name)) {
      setIsProcessingTool(true);
      const result = await callVoiceTools(name, args);
      setIsProcessingTool(false);
      optsRef.current.onToolEvent?.({ name, phase: "done", success: !!result.success, message: result.message });
      replyWithToolResult(callId, result);
      return;
    }

    // Stage write action — wait for user to confirm with "handle it".
    pendingActionRef.current = { name, args };
    replyWithToolResult(callId, {
      success: true,
      message:
        `PENDING — nothing has been done yet. Read the user the exact details of this ${name} in one or two short sentences` +
        ` (for emails: recipient, subject, and the gist of the body), then say "Just say 'handle it' and I'll take care of it."` +
        ` When they say "handle it" or confirm, call confirm_action. If they decline, call cancel_action.` +
        ` If they ask for changes, call ${name} again with revised arguments.`,
    });
  }, [callVoiceTools, replyWithToolResult]);

  const stopConversationRef = useRef<() => void>(() => {});

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!activeRef.current) return;
      sendDc({
        type: "response.create",
        response: {
          instructions: "The session is ending due to inactivity. Say a brief friendly goodbye in one sentence, then stop.",
        },
      });
      setTimeout(() => {
        optsRef.current.onAutoEnd?.();
        stopConversationRef.current();
      }, 6000);
    }, 30_000);
  }, [sendDc]);

  const stopConversation = useCallback(() => {
    activeRef.current = false;
    localStorage.removeItem("normy_voice_session_active");
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    setConversationActive(false);
    setIsConnecting(false);
    setIsSpeaking(false);
    setIsProcessingTool(false);
    setStartupStage(null);
    setStartupElapsedMs(0);
    if (startupTimerRef.current) { clearInterval(startupTimerRef.current); startupTimerRef.current = null; }
    if (echoUnmuteTimerRef.current) { clearTimeout(echoUnmuteTimerRef.current); echoUnmuteTimerRef.current = null; }
    pendingActionRef.current = null;
    handledCallsRef.current.clear();
    outputBufferActiveRef.current = false;
    greetingTriggeredRef.current = false;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    // Stop mic tracks so the browser releases the mic indicator.
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }
  }, []);
  stopConversationRef.current = stopConversation;

  const startConversation = useCallback(async () => {
    if (activeRef.current || !realtimeEnabled()) return;
    if (Date.now() - lastFailRef.current < 3000) return;
    setError(null);
    activeRef.current = true;
    localStorage.setItem("normy_voice_session_active", "1");
    const mySessionId = ++sessionIdRef.current;
    setIsConnecting(true);
    startupStartRef.current = Date.now();
    setStartupElapsedMs(0);
    startupTimerRef.current = setInterval(() => {
      setStartupElapsedMs(Date.now() - startupStartRef.current);
    }, 100);

    try {
      sessionTzRef.current = Intl.DateTimeFormat().resolvedOptions().timeZone;

      if (!prefsLoadedRef.current) {
        setStartupStage("Loading preferences…");
        await new Promise<void>((resolve) => {
          const iv = setInterval(() => { if (prefsLoadedRef.current) { clearInterval(iv); resolve(); } }, 50);
          setTimeout(() => { clearInterval(iv); resolve(); }, 3000);
        });
      }

      setStartupStage("Fetching voice token…");
      // Fetch token and mic access in parallel to cut startup time.
      const [tokenResult, micStream] = await Promise.all([
        supabase.functions.invoke("voice-token", {
          body: {
            agentName: optsRef.current.agentName,
            tz: sessionTzRef.current,
            voiceId: voiceIdRef.current || "alloy",
            firstSession: !localStorage.getItem("normy_voice_onboarded"),
            devMode: (() => {
              const param = new URLSearchParams(window.location.search).get("voiceDevMode");
              if (param === "1") { localStorage.setItem("voiceDevMode", "1"); return true; }
              if (param === "0") { localStorage.removeItem("voiceDevMode"); return false; }
              return localStorage.getItem("voiceDevMode") === "1";
            })(),
          },
        }),
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
      ]);

      const { data: tokenData, error: tokenErr } = tokenResult;
      if (tokenErr) throw new Error(tokenErr.message || "Failed to get voice token");
      if (!tokenData?.client_secret) throw new Error("No client_secret in response");
      if (tokenData.isFirstSession === true) {
        // Don't mark done yet — only after user actually speaks their first utterance
        pendingOnboardingRef.current = true;
      } else {
        // Already onboarded — ensure localStorage is in sync
        localStorage.setItem("normy_voice_onboarded", "1");
      }

      // If stopConversation() fired while we were awaiting (e.g. unmount, navigate
      // away), release the mic stream the browser just granted and bail out.
      if (!activeRef.current) {
        micStream.getTracks().forEach((t) => t.stop());
        return;
      }

      micStreamRef.current = micStream;
      setStartupStage("Connecting…");

      // ---- WebRTC setup ----
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };

      micStream.getTracks().forEach((t) => pc.addTrack(t, micStream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        handledCallsRef.current.clear();
      };

      dc.onmessage = async (e) => {
        let event: any;
        try { event = JSON.parse(e.data as string); } catch { return; }
        const t = event.type;

        if (import.meta.env.DEV) {
          console.log("[RealtimeVoice]", t, event);
        }

        if (t === "session.created") {
          if (startupTimerRef.current) { clearInterval(startupTimerRef.current); startupTimerRef.current = null; }
          setStartupStage(null);
          setConversationActive(true);
          setIsConnecting(false);
          // Greet immediately — VAD already configured at session creation via voice-token.
          // gpt-realtime does not accept session.update for turn_detection client-side.
          if (!greetingTriggeredRef.current) {
            greetingTriggeredRef.current = true;
            sendDc({ type: "response.create" });
          }

        } else if (t === "session.updated") {
          setConversationActive(true);
          setIsConnecting(false);

        } else if (t === "input_audio_buffer.timeout_triggered") {
          // Server-side idle timeout — 2 min of silence. Let the model say goodbye,
          // then end the session once the goodbye audio finishes.
          sendDc({
            type: "response.create",
            response: {
              instructions: "The session is ending due to inactivity. Say a brief friendly goodbye in one sentence, then stop.",
            },
          });
          // Give the goodbye audio time to play before tearing down.
          setTimeout(() => {
            optsRef.current.onAutoEnd?.();
            stopConversation();
          }, 6000);

        } else if (t === "response.created") {
          // Agent is speaking — pause the idle timer so it doesn't fire mid-response.
          if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
          setIsSpeaking(true);

        } else if (t === "response.output_item.done") {
          // Primary place to catch function calls for gpt-realtime-2.
          const item = event.item;
          if (item?.type === "function_call") {
            await handleToolCall(item.name, item.call_id, item.arguments || "{}");
          }

        } else if (t === "response.done") {
          // Only clear isSpeaking for non-audio responses (tools, text-only).
          // Audio responses: isSpeaking cleared by output_audio_buffer.stopped.
          if (!outputBufferActiveRef.current) {
            setIsSpeaking(false);
          }
          // Secondary function call extraction — deduplication prevents double execution.
          const output = event.response?.output || [];
          for (const item of output) {
            if (item.type === "function_call") {
              await handleToolCall(item.name, item.call_id, item.arguments || "{}");
            }
          }

        } else if (
          t === "response.output_audio_transcript.done" ||
          t === "response.audio_transcript.done"
        ) {
          const text: string = event.transcript || "";
          if (text && !text.trim().startsWith("{")) {
            optsRef.current.onTranscript?.("ASSISTANT", text);
          }

        } else if (
          t === "conversation.item.input_audio_transcription.completed" ||
          t === "input_audio_transcription.completed"
        ) {
          const text: string = event.transcript || "";
          if (text && !text.trim().startsWith("{")) {
            optsRef.current.onTranscript?.("USER", text);
            // First utterance marks onboarding complete — greeting was heard, user engaged.
            if (pendingOnboardingRef.current) {
              pendingOnboardingRef.current = false;
              localStorage.setItem("normy_voice_onboarded", "1");
              supabase.auth.getUser().then(({ data: { user } }) => {
                if (user) {
                  supabase.from("user_preferences")
                    .update({ voice_onboarded: true } as any)
                    .eq("user_id", user.id)
                    .then(() => {});
                }
              });
            }
          }

        } else if (t === "output_audio_buffer.started") {
          outputBufferActiveRef.current = true;
          // Mute mic while agent audio plays — prevents speaker bleed from
          // triggering VAD on mobile and causing echo double-responses.
          if (echoUnmuteTimerRef.current) { clearTimeout(echoUnmuteTimerRef.current); echoUnmuteTimerRef.current = null; }
          micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });

        } else if (t === "output_audio_buffer.stopped") {
          outputBufferActiveRef.current = false;
          setIsSpeaking(false); // Audio done — isSpeaking tracks playback, not generation
          // Agent finished speaking — start 30s idle countdown.
          resetIdleTimer();
          // Unmute after short delay to let acoustic reverb die down.
          if (echoUnmuteTimerRef.current) clearTimeout(echoUnmuteTimerRef.current);
          echoUnmuteTimerRef.current = setTimeout(() => {
            micStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
            echoUnmuteTimerRef.current = null;
          }, 400);

        } else if (t === "input_audio_buffer.speech_started") {
          // User is speaking — cancel idle timer.
          if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
          setIsSpeaking(false);

        } else if (t === "error") {
          const msg: string = event.error?.message || JSON.stringify(event.error);
          const code: string = event.error?.code || "";
          console.error("[RealtimeVoice] error event:", event.error);
          // session.update errors are non-fatal — VAD reinforcement is best-effort.
          const isSessionUpdateErr =
            msg.includes("session.update") ||
            code.startsWith("session.update") ||
            (event.error?.param || "").startsWith("session.");
          const isFatal = !isSessionUpdateErr;
          if (isFatal) { setError("Voice error — tap the mic to restart."); stopConversation(); }
        }
      };

      dc.onclose = () => { if (activeRef.current && sessionIdRef.current === mySessionId) stopConversation(); };

      pc.oniceconnectionstatechange = () => {
        if (sessionIdRef.current !== mySessionId) return;
        const s = pc.iceConnectionState;
        if (s === "failed" || s === "disconnected") {
          setError("Voice connection dropped — tap the mic to restart.");
          stopConversation();
        }
      };

      // SDP negotiation — happens while ICE candidates gather in the background.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls?model=gpt-realtime", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.client_secret}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpRes.ok) throw new Error(`OpenAI WebRTC ${sdpRes.status}: ${await sdpRes.text()}`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

    } catch (e: any) {
      lastFailRef.current = Date.now();
      const msg = e?.message || "Voice failed to start";
      console.error("[RealtimeVoice] startup failed:", msg);
      setError(msg);
      stopConversation();
    }
  }, [handleToolCall, stopConversation, sendDc]);

  const toggleConversation = useCallback(() => {
    if (activeRef.current) stopConversation();
    else void startConversation();
  }, [startConversation, stopConversation]);

  useEffect(() => stopConversation, [stopConversation]);

  return {
    enabled: realtimeEnabled(),
    conversationActive,
    isConnecting,
    isListening: conversationActive && !isSpeaking && !isProcessingTool,
    isSpeaking,
    isProcessingTool,
    error,
    startupStage,
    startupElapsedMs,
    startConversation,
    stopConversation,
    toggleConversation,
    sonicVoiceId: voicePrefs.sonic_voice_id,
    setSonicVoiceId: (id: string) =>
      updateVoicePrefs({ sonic_voice_id: id, tts_groq_voice_id: sonicToGroqVoiceId(id) }),
  };
}
