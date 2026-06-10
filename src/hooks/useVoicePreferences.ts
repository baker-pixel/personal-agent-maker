import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_GROQ_VOICE, isLegacyVoiceId } from "@/lib/groqVoices";

export type TtsProvider = "browser" | "groq";

export interface VoicePrefs {
  tts_voice_uri: string | null;
  tts_rate: number;
  tts_pitch: number;
  tts_enabled: boolean;
  voice_conversation_enabled: boolean;
  stt_language: string;
  tts_provider: TtsProvider;
  tts_groq_voice_id: string | null;
}

const DEFAULTS: VoicePrefs = {
  tts_voice_uri: null,
  tts_rate: 1.05,
  tts_pitch: 1.0,
  tts_enabled: false,
  voice_conversation_enabled: false,
  stt_language: "en-US",
  // Groq is the product default voice; browser is only a runtime fallback.
  tts_provider: "groq",
  tts_groq_voice_id: DEFAULT_GROQ_VOICE,
};

function rowToPrefs(d: Record<string, any>): VoicePrefs {
  const rawProvider = d.tts_provider as string | null;
  const provider: TtsProvider = rawProvider === "browser" ? "browser" : "groq";
  const rawVoice = d.tts_elevenlabs_voice_id as string | null;
  const groqVoiceId = isLegacyVoiceId(rawVoice) ? DEFAULT_GROQ_VOICE : rawVoice;
  return {
    tts_voice_uri: d.tts_voice_uri ?? null,
    tts_rate: d.tts_rate != null ? Number(d.tts_rate) : DEFAULTS.tts_rate,
    tts_pitch: d.tts_pitch != null ? Number(d.tts_pitch) : DEFAULTS.tts_pitch,
    tts_enabled: !!d.tts_enabled,
    voice_conversation_enabled: !!d.voice_conversation_enabled,
    stt_language: d.stt_language ?? DEFAULTS.stt_language,
    tts_provider: provider,
    tts_groq_voice_id: groqVoiceId,
  };
}

interface VoicePrefsOptions {
  // When the parent already fetched user_preferences, pass userId + raw row
  // to skip the duplicate query and auth subscription.
  initialData?: { userId: string; row: Record<string, any> };
}

export function useVoicePreferences(opts?: VoicePrefsOptions) {
  const [prefs, setPrefs] = useState<VoicePrefs>(() =>
    opts?.initialData ? rowToPrefs(opts.initialData.row) : DEFAULTS
  );
  const [loaded, setLoaded] = useState(() => !!opts?.initialData);
  const [userId, setUserId] = useState<string | null>(() => opts?.initialData?.userId ?? null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    // Skip self-fetch when the parent already supplied data
    if (opts?.initialData) return;

    let cancelled = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // No user yet (session still restoring at boot): do NOT publish defaults
      // as "loaded" — consumers would hydrate from them and ignore the real
      // prefs that arrive via the auth listener moments later.
      if (!user || cancelled) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("user_preferences")
        .select("tts_voice_uri, tts_rate, tts_pitch, tts_enabled, voice_conversation_enabled, stt_language, tts_provider, tts_elevenlabs_voice_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) setPrefs(rowToPrefs(data as any));
      setLoaded(true);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            tts_elevenlabs_voice_id: next.tts_groq_voice_id, // reuse existing column
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
