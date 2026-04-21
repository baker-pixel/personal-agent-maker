import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VoicePrefs {
  tts_voice_uri: string | null;
  tts_rate: number;
  tts_pitch: number;
  tts_enabled: boolean;
  voice_conversation_enabled: boolean;
}

const DEFAULTS: VoicePrefs = {
  tts_voice_uri: null,
  tts_rate: 1.05,
  tts_pitch: 1.0,
  tts_enabled: false,
  voice_conversation_enabled: false,
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

  // Load on mount / auth change
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoaded(true); return; }
      if (cancelled) return;
      setUserId(user.id);
      const { data } = await supabase
        .from("user_preferences")
        .select("tts_voice_uri, tts_rate, tts_pitch, tts_enabled, voice_conversation_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setPrefs({
          tts_voice_uri: data.tts_voice_uri ?? null,
          tts_rate: data.tts_rate != null ? Number(data.tts_rate) : DEFAULTS.tts_rate,
          tts_pitch: data.tts_pitch != null ? Number(data.tts_pitch) : DEFAULTS.tts_pitch,
          tts_enabled: !!data.tts_enabled,
          voice_conversation_enabled: !!data.voice_conversation_enabled,
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
          },
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
