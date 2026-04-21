import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TtsProvider = "browser" | "elevenlabs";

export interface VoicePrefs {
  tts_voice_uri: string | null;
  tts_rate: number;
  tts_pitch: number;
  tts_enabled: boolean;
  voice_conversation_enabled: boolean;
  stt_language: string;
  // Premium TTS
  tts_provider: TtsProvider;
  tts_elevenlabs_voice_id: string | null;
  tts_elevenlabs_model_id: string;
  tts_stability: number;
  tts_similarity: number;
}

const DEFAULTS: VoicePrefs = {
  tts_voice_uri: null,
  tts_rate: 1.05,
  tts_pitch: 1.0,
  tts_enabled: false,
  voice_conversation_enabled: false,
  stt_language: "en-US",
  tts_provider: "browser",
  tts_elevenlabs_voice_id: "EXAVITQu4vr4xnSDxMaL", // Sarah
  tts_elevenlabs_model_id: "eleven_multilingual_v2",
  tts_stability: 0.5,
  tts_similarity: 0.75,
};

/**
 * Loads voice preferences from user_preferences and exposes a setter that
 * persists changes (debounced) to the DB so settings sync across devices.
 */
export function useVoicePreferences() {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoaded(true); return; }
      if (cancelled) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("user_preferences")
        .select("tts_voice_uri, tts_rate, tts_pitch, tts_enabled, voice_conversation_enabled, stt_language, tts_provider, tts_elevenlabs_voice_id, tts_elevenlabs_model_id, tts_stability, tts_similarity")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const d = data as any;
        setPrefs({
          tts_voice_uri: d.tts_voice_uri ?? null,
          tts_rate: d.tts_rate != null ? Number(d.tts_rate) : DEFAULTS.tts_rate,
          tts_pitch: d.tts_pitch != null ? Number(d.tts_pitch) : DEFAULTS.tts_pitch,
          tts_enabled: !!d.tts_enabled,
          voice_conversation_enabled: !!d.voice_conversation_enabled,
          stt_language: d.stt_language ?? DEFAULTS.stt_language,
          tts_provider: (d.tts_provider as TtsProvider) ?? DEFAULTS.tts_provider,
          tts_elevenlabs_voice_id: d.tts_elevenlabs_voice_id ?? DEFAULTS.tts_elevenlabs_voice_id,
          tts_elevenlabs_model_id: d.tts_elevenlabs_model_id ?? DEFAULTS.tts_elevenlabs_model_id,
          tts_stability: d.tts_stability != null ? Number(d.tts_stability) : DEFAULTS.tts_stability,
          tts_similarity: d.tts_similarity != null ? Number(d.tts_similarity) : DEFAULTS.tts_similarity,
        });
      }
      setLoaded(true);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const persist = (next: VoicePrefs) => {
    if (!userId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      await supabase
        .from("user_preferences")
        .upsert(
          {
            user_id: userId,
            tts_voice_uri: next.tts_voice_uri,
            tts_rate: next.tts_rate,
            tts_pitch: next.tts_pitch,
            tts_enabled: next.tts_enabled,
            voice_conversation_enabled: next.voice_conversation_enabled,
            stt_language: next.stt_language,
            tts_provider: next.tts_provider,
            tts_elevenlabs_voice_id: next.tts_elevenlabs_voice_id,
            tts_elevenlabs_model_id: next.tts_elevenlabs_model_id,
            tts_stability: next.tts_stability,
            tts_similarity: next.tts_similarity,
          } as any,
          { onConflict: "user_id" }
        );
    }, 400) as unknown as number;
  };

  const update = (patch: Partial<VoicePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  };

  return { prefs, loaded, update };
}
