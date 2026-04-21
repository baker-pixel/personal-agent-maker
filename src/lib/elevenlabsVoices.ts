// Curated premium voices from ElevenLabs.
// Keep this list small — these are the recommended/known-good voices.
export interface ElevenLabsVoice {
  id: string;
  name: string;
  description: string;
  accent: string;
}

export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Warm, professional", accent: "American" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", description: "Friendly, conversational", accent: "American" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "Calm, narrator", accent: "American" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Clear, upbeat", accent: "British" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", description: "Soft, soothing", accent: "British" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", description: "Bright, energetic", accent: "American" },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", description: "Confident, neutral", accent: "American" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "Mature, authoritative", accent: "British" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", description: "Steady, articulate", accent: "American" },
  { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie", description: "Casual, approachable", accent: "Australian" },
  { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", description: "Intense, dramatic", accent: "British" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", description: "Articulate, modern", accent: "American" },
  { id: "bIHbv24MWmeRgasZH58o", name: "Will", description: "Friendly, mid-range", accent: "American" },
  { id: "cjVigY5qzO86Huf0OWal", name: "Eric", description: "Smooth, mature", accent: "American" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", description: "Casual, natural", accent: "American" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Deep, resonant", accent: "American" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Newsreader, formal", accent: "British" },
  { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", description: "Trustworthy, deep", accent: "American" },
];

export const ELEVENLABS_MODELS = [
  { id: "eleven_multilingual_v2", label: "Multilingual (29 languages)", description: "Best quality, supports any language" },
  { id: "eleven_turbo_v2_5", label: "Turbo (low latency)", description: "Faster response, slight quality tradeoff" },
];
