export interface GroqVoice {
  id: string;
  name: string;
  description: string;
}

// Orpheus English — canopylabs/orpheus-v1-english
export const GROQ_VOICES: GroqVoice[] = [
  { id: "autumn", name: "Female Warm",         description: "Warm, conversational"  },
  { id: "diana",  name: "Female Professional", description: "Clear, professional"   },
  { id: "hannah", name: "Female Friendly",     description: "Friendly, natural"     },
  { id: "austin", name: "Male Casual",         description: "Casual, approachable"  },
  { id: "daniel", name: "Male Articulate",     description: "Steady, articulate"    },
  { id: "troy",   name: "Male Confident",      description: "Confident, smooth"     },
];

export const DEFAULT_GROQ_VOICE = "autumn";

// Any voice not in the known English list is legacy (PlayAI / ElevenLabs ID)
const VALID_VOICE_IDS = new Set(GROQ_VOICES.map(v => v.id));
export function isLegacyVoiceId(id: string | null | undefined): boolean {
  if (!id) return true;
  return !VALID_VOICE_IDS.has(id);
}
