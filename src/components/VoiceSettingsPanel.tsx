import { Settings2, Play } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}: VoiceSettingsPanelProps) {
  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const otherVoices = voices.filter((v) => !v.lang.toLowerCase().startsWith("en"));

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
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div>
            <h4 className="font-display text-sm font-semibold text-foreground">Voice settings</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose how Normy sounds when speaking.
            </p>
          </div>

          {!isSupported ? (
            <p className="text-xs text-muted-foreground">
              Voice synthesis isn't supported in this browser.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Voice</Label>
                <Select
                  value={voiceURI ?? undefined}
                  onValueChange={onVoiceChange}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={voices.length ? "Default" : "Loading voices…"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {englishVoices.length > 0 && (
                      <>
                        {englishVoices.map((v) => (
                          <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-sm">
                            {v.name} <span className="text-muted-foreground">({v.lang})</span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {otherVoices.length > 0 && (
                      <>
                        {otherVoices.map((v) => (
                          <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-sm">
                            {v.name} <span className="text-muted-foreground">({v.lang})</span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

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
