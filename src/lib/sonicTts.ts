/**
 * Voice preview TTS — returns null (falls back to Groq preview).
 * The Railway /tts endpoint is gone; voice previews use Groq TTS.
 */
export async function fetchSonicTts(
  _text: string,
  _voiceId: string,
  _signal?: AbortSignal
): Promise<Blob | null> {
  return null;
}
