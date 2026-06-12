// Amazon Nova 2 Sonic voice catalog.
// https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html
// tiffany and matthew are polyglots — they speak all supported languages.

import { DEFAULT_GROQ_VOICE } from "@/lib/groqVoices";

export const DEFAULT_SONIC_VOICE = "matthew";

// English voices only, shown without names — gender + character trait is the
// label (no accent/country shown in the UI).
export interface SonicVoice {
  id: string;
  gender: "Male" | "Female";
  description: string;
}

export const SONIC_VOICES: SonicVoice[] = [
  { id: "matthew", gender: "Male",   description: "Professional" },
  { id: "tiffany", gender: "Female", description: "Warm" },
  { id: "amy",     gender: "Female", description: "Calm" },
  { id: "olivia",  gender: "Female", description: "Upbeat" },
  { id: "kiara",   gender: "Female", description: "Gentle" },
  { id: "arjun",   gender: "Male",   description: "Energetic" },
];

export const SONIC_VOICE_IDS = new Set(SONIC_VOICES.map((v) => v.id));

// Groq TTS (Orpheus, English-only) still renders chat/briefing readouts — it
// can't speak Nova voice ids, so map the picked Nova voice to the
// gender-matched Orpheus voice for those surfaces.
const GROQ_MALE_VOICE = "daniel";

export function sonicToGroqVoiceId(sonicId: string | null | undefined): string {
  const voice = SONIC_VOICES.find((v) => v.id === sonicId);
  if (!voice) return DEFAULT_GROQ_VOICE;
  return voice.gender === "Male" ? GROQ_MALE_VOICE : DEFAULT_GROQ_VOICE;
}
