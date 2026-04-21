import { useMemo } from "react";
import { Settings2, Play, Sparkles, Crown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ELEVENLABS_VOICES, ELEVENLABS_MODELS } from "@/lib/elevenlabsVoices";

type TtsProvider = "browser" | "elevenlabs";

interface VoiceSettingsPanelProps {
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  onVoiceChange: (uri: string) => void;
  rate: number;
  onRateChange: (v: number) => void;
  pitch: number;
  onPitchChange: (v: number) => void;
  onPreview: () => void;
  isSupported: boolean;
  // STT language
  sttLanguage?: string;
  onSttLanguageChange?: (lang: string) => void;
  // Premium (ElevenLabs)
  provider?: TtsProvider;
  onProviderChange?: (p: TtsProvider) => void;
  elevenlabsVoiceId?: string | null;
  onElevenlabsVoiceChange?: (id: string) => void;
  elevenlabsModelId?: string;
  onElevenlabsModelChange?: (id: string) => void;
  stability?: number;
  onStabilityChange?: (v: number) => void;
  similarity?: number;
  onSimilarityChange?: (v: number) => void;
}

// Common dictation languages for the STT picker.
const STT_LANGUAGES: { code: string; label: string }[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "en-CA", label: "English (Canada)" },
  { code: "en-IN", label: "English (India)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "fr-CA", label: "French (Canada)" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "pt-PT", label: "Portuguese (Portugal)" },
  { code: "nl-NL", label: "Dutch" },
  { code: "sv-SE", label: "Swedish" },
  { code: "da-DK", label: "Danish" },
  { code: "no-NO", label: "Norwegian" },
  { code: "fi-FI", label: "Finnish" },
  { code: "pl-PL", label: "Polish" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
  { code: "zh-TW", label: "Chinese (Taiwan)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ar-SA", label: "Arabic" },
  { code: "tr-TR", label: "Turkish" },
  { code: "ru-RU", label: "Russian" },
];

// Tone presets — friendly defaults that map to rate/pitch combos.
const TONE_PRESETS = [
  { id: "professional", label: "Professional", rate: 1.0, pitch: 1.0 },
  { id: "warm", label: "Warm", rate: 0.95, pitch: 0.95 },
  { id: "energetic", label: "Energetic", rate: 1.15, pitch: 1.1 },
  { id: "calm", label: "Calm", rate: 0.9, pitch: 0.9 },
  { id: "fast", label: "Fast briefing", rate: 1.3, pitch: 1.0 },
];

const LANG_DISPLAY: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  pl: "Polish",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  hi: "Hindi",
  ar: "Arabic",
  tr: "Turkish",
  ru: "Russian",
};

function languageGroupLabel(lang: string): string {
  const base = lang.split("-")[0].toLowerCase();
  const region = lang.split("-")[1];
  const baseName = LANG_DISPLAY[base] || lang;
  return region ? `${baseName} (${region})` : baseName;
}

export function VoiceSettingsPanel({
  voices,
  voiceURI,
  onVoiceChange,
  rate,
  onRateChange,
  pitch,
  onPitchChange,
  onPreview,
  isSupported,
  sttLanguage,
  onSttLanguageChange,
  provider = "browser",
  onProviderChange,
  elevenlabsVoiceId,
  onElevenlabsVoiceChange,
  elevenlabsModelId,
  onElevenlabsModelChange,
  stability = 0.5,
  onStabilityChange,
  similarity = 0.75,
  onSimilarityChange,
}: VoiceSettingsPanelProps) {
  const isPremium = provider === "elevenlabs";

  // Group voices by language tag (e.g. "en-US", "fr-FR"). Sort: English first, then alpha.
  const voiceGroups = useMemo(() => {
    const groups = new Map<string, SpeechSynthesisVoice[]>();
    for (const v of voices) {
      const key = v.lang || "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }
    const entries = Array.from(groups.entries());
    entries.sort(([a], [b]) => {
      const aEn = a.toLowerCase().startsWith("en");
      const bEn = b.toLowerCase().startsWith("en");
      if (aEn && !bEn) return -1;
      if (bEn && !aEn) return 1;
      return a.localeCompare(b);
    });
    // Sort voices inside each group alphabetically.
    for (const [, list] of entries) list.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }, [voices]);

  const applyPreset = (id: string) => {
    const preset = TONE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    onRateChange(preset.rate);
    onPitchChange(preset.pitch);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          title="Voice settings"
          className="flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors mr-1"
        >
          <Settings2 className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-h-[80vh] overflow-y-auto">
        <div className="space-y-4">
          <div>
            <h4 className="font-display text-sm font-semibold text-foreground">Voice settings</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Personalize how Normy sounds and which language you speak in.
            </p>
          </div>

          {!isSupported ? (
            <p className="text-xs text-muted-foreground">
              Voice synthesis isn't supported in this browser.
            </p>
          ) : (
            <>
              {/* Tone presets */}
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  Tone presets
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p.id)}
                      className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice picker grouped by language/accent */}
              <div className="space-y-1.5">
                <Label className="text-xs">Voice & accent</Label>
                <Select
                  value={voiceURI ?? undefined}
                  onValueChange={onVoiceChange}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={voices.length ? "Default" : "Loading voices…"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {voiceGroups.map(([lang, list]) => (
                      <SelectGroup key={lang}>
                        <SelectLabel className="text-xs">{languageGroupLabel(lang)}</SelectLabel>
                        {list.map((v) => (
                          <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-sm">
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* STT language picker */}
              {onSttLanguageChange && (
                <div className="space-y-1.5">
                  <Label className="text-xs">I'll speak in…</Label>
                  <Select
                    value={sttLanguage ?? "en-US"}
                    onValueChange={onSttLanguageChange}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {STT_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code} className="text-sm">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    The language Normy listens for when you talk.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Speed</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{rate.toFixed(2)}×</span>
                </div>
                <Slider
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={[rate]}
                  onValueChange={(v) => onRateChange(v[0])}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Pitch</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{pitch.toFixed(2)}</span>
                </div>
                <Slider
                  min={0}
                  max={2}
                  step={0.05}
                  value={[pitch]}
                  onValueChange={(v) => onPitchChange(v[0])}
                />
              </div>

              <button
                onClick={onPreview}
                className="w-full flex items-center justify-center gap-2 h-9 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Preview voice
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
