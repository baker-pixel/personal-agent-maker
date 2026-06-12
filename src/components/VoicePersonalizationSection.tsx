import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { VoiceSettingsPanel } from "@/components/VoiceSettingsPanel";
import { useVoicePreferences } from "@/hooks/useVoicePreferences";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { sonicToGroqVoiceId } from "@/lib/sonicVoices";
import { fetchSonicTts } from "@/lib/sonicTts";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface VoicePersonalizationSectionProps {
  initialData?: { userId: string; row: Record<string, any> };
}

export function VoicePersonalizationSection({ initialData }: VoicePersonalizationSectionProps) {
  const { prefs, loaded, update } = useVoicePreferences(initialData ? { initialData } : undefined);
  const tts = useTextToSpeech({
    remote: {
      voiceURI: prefs.tts_voice_uri,
      rate: prefs.tts_rate,
      pitch: prefs.tts_pitch,
      enabled: prefs.tts_enabled,
      provider: prefs.tts_provider,
      groqVoiceId: prefs.tts_groq_voice_id,
      loaded,
    },
    onChange: (patch) => update(patch as any),
  });

  // Force a voices refresh on mount (Web Speech is lazy on some browsers).
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const refresh = () => setVoices(window.speechSynthesis.getVoices());
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = () => {
    // Unlock audio in the same user-gesture tick (required by iOS / strict
    // autoplay policies) BEFORE any async work happens inside previewVoice.
    tts.unlockAudio();

    // Browser-voice mode previews the picked Web Speech voice as before.
    if (tts.provider !== "groq") {
      tts.previewVoice();
      return;
    }

    // Premium mode: preview the real Nova voice via the voice server,
    // falling back to the Groq stand-in when the server isn't reachable.
    const SILENT_WAV =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio();
      previewAudioRef.current.setAttribute("playsinline", "true");
      (previewAudioRef.current as any).playsInline = true;
    }
    const audio = previewAudioRef.current;
    audio.src = SILENT_WAV;
    audio.play().catch(() => {});

    fetchSonicTts("Hi, I'm Normy. This is how I'll sound when we talk.", prefs.sonic_voice_id)
      .then((blob) => {
        if (!blob) { tts.previewVoice(); return; }
        const url = URL.createObjectURL(blob);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.src = url;
        audio.play().catch(() => { URL.revokeObjectURL(url); tts.previewVoice(); });
      })
      .catch(() => tts.previewVoice());
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Mic className="w-5 h-5 text-accent" />
        <h2 className="font-display font-semibold">Voice & Speech</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Personalize how Normy sounds — pick a voice, accent, speed and language.
      </p>

      <div className="border rounded-xl p-4 flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="tts-enabled-toggle" className="text-sm font-medium cursor-pointer">
            Speak responses out loud
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Normy reads briefings and chat replies aloud.
          </p>
        </div>
        <Switch
          id="tts-enabled-toggle"
          checked={tts.enabled}
          onCheckedChange={() => tts.toggle()}
        />
      </div>

      <div className="border rounded-xl p-4">
        <VoiceSettingsPanel
          inline
          voices={voices}
          voiceURI={tts.voiceURI}
          onVoiceChange={tts.setVoiceURI}
          rate={tts.rate}
          onRateChange={tts.setRate}
          pitch={tts.pitch}
          onPitchChange={tts.setPitch}
          onPreview={handlePreview}
          isSupported={tts.isSupported}
          sttLanguage={prefs.stt_language}
          onSttLanguageChange={(lang) => update({ stt_language: lang })}
          provider={tts.provider}
          onProviderChange={tts.setProvider}
          sonicVoiceId={prefs.sonic_voice_id}
          onSonicVoiceChange={(id) =>
            // One Nova voice drives everything: live sessions use it directly,
            // Groq readouts get the gender-matched Orpheus equivalent.
            update({ sonic_voice_id: id, tts_groq_voice_id: sonicToGroqVoiceId(id) })
          }
        />
      </div>
    </section>
  );
}
