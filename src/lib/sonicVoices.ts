// OpenAI Realtime voice catalog (used for direct WebRTC voice sessions).
import { DEFAULT_GROQ_VOICE } from "@/lib/groqVoices";

export const DEFAULT_SONIC_VOICE = "alloy";

export interface SonicVoice {
  id: string;
  gender: "Male" | "Female";
  description: string;
}

// OpenAI Realtime voices: alloy ash ballad coral echo sage shimmer verse
export const SONIC_VOICES: SonicVoice[] = [
  { id: "alloy",   gender: "Female", description: "Neutral, versatile" },
  { id: "coral",   gender: "Female", description: "Warm, friendly" },
  { id: "sage",    gender: "Female", description: "Calm, composed" },
  { id: "shimmer", gender: "Female", description: "Gentle, soft" },
  { id: "ash",     gender: "Male",   description: "Warm, engaging" },
  { id: "ballad",  gender: "Male",   description: "Expressive, smooth" },
  { id: "echo",    gender: "Male",   description: "Deep, steady" },
  { id: "verse",   gender: "Male",   description: "Energetic, confident" },
];

export const SONIC_VOICE_IDS = new Set(SONIC_VOICES.map((v) => v.id));

// Groq TTS (Orpheus) still renders chat/briefing readouts — map the picked
// OpenAI voice to the gender-matched Orpheus voice for those surfaces.
const GROQ_MALE_VOICE = "daniel";

export function sonicToGroqVoiceId(sonicId: string | null | undefined): string {
  const voice = SONIC_VOICES.find((v) => v.id === sonicId);
  if (!voice) return DEFAULT_GROQ_VOICE;
  return voice.gender === "Male" ? GROQ_MALE_VOICE : DEFAULT_GROQ_VOICE;
}
