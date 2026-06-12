import { supabase } from "@/integrations/supabase/client";

const VOICE_SERVER_URL: string | undefined = import.meta.env.VITE_VOICE_SERVER_URL;

/**
 * One-shot Nova Sonic synthesis via the voice server's /tts endpoint, so voice
 * previews play the real Nova voice instead of the Groq stand-in.
 * Returns null when the voice server isn't configured or the call fails —
 * callers fall back to the Groq preview path.
 */
export async function fetchSonicTts(
  text: string,
  voiceId: string,
  signal?: AbortSignal
): Promise<Blob | null> {
  if (!VOICE_SERVER_URL) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch(`${VOICE_SERVER_URL}/tts`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ text, voiceId }),
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch (e: any) {
    if (e?.name === "AbortError") throw e;
    console.warn("[Sonic TTS] preview failed, falling back:", e?.message);
    return null;
  }
}
