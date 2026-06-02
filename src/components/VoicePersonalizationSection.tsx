import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { VoiceSettingsPanel } from "@/components/VoiceSettingsPanel";
import { useVoicePreferences } from "@/hooks/useVoicePreferences";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
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

  const handlePreview = () => {
    // Unlock audio in the same user-gesture tick (required by iOS / strict
    // autoplay policies) BEFORE any async work happens inside previewVoice.
    tts.unlockAudio();
    tts.previewVoice();
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
          groqVoiceId={tts.groqVoiceId}
          onGroqVoiceChange={tts.setGroqVoiceId}
        />
      </div>
    </section>
  );
}
