export interface GroqVoice {
  id: string;
  name: string;
  description: string;
}

// Orpheus English — canopylabs/orpheus-v1-english
export const GROQ_VOICES: GroqVoice[] = [
  { id: "autumn", name: "Autumn", description: "Warm, conversational"  },
  { id: "diana",  name: "Diana",  description: "Clear, professional"   },
  { id: "hannah", name: "Hannah", description: "Friendly, natural"     },
  { id: "austin", name: "Austin", description: "Casual, approachable"  },
  { id: "daniel", name: "Daniel", description: "Steady, articulate"    },
  { id: "troy",   name: "Troy",   description: "Confident, smooth"     },
];

export const DEFAULT_GROQ_VOICE = "autumn";

// Any voice not in the known English list is legacy (PlayAI / ElevenLabs ID)
const VALID_VOICE_IDS = new Set(GROQ_VOICES.map(v => v.id));
export function isLegacyVoiceId(id: string | null | undefined): boolean {
  if (!id) return true;
  return !VALID_VOICE_IDS.has(id);
}
