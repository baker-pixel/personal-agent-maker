// Amazon Nova 2 Sonic voice catalog.
// https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html
// tiffany and matthew are polyglots — they speak all supported languages.

export const DEFAULT_SONIC_VOICE = "matthew";

export interface SonicVoice {
  id: string;
  label: string;
}

export const SONIC_VOICES: SonicVoice[] = [
  { id: "matthew", label: "Matthew — English US (polyglot)" },
  { id: "tiffany", label: "Tiffany — English US (polyglot)" },
  { id: "amy", label: "Amy — English UK" },
  { id: "olivia", label: "Olivia — English Australia" },
  { id: "kiara", label: "Kiara — English India / Hindi" },
  { id: "arjun", label: "Arjun — English India / Hindi" },
  { id: "ambre", label: "Ambre — French" },
  { id: "florian", label: "Florian — French" },
  { id: "beatrice", label: "Beatrice — Italian" },
  { id: "lorenzo", label: "Lorenzo — Italian" },
  { id: "tina", label: "Tina — German" },
  { id: "lennart", label: "Lennart — German" },
  { id: "lupe", label: "Lupe — Spanish US" },
  { id: "carlos", label: "Carlos — Spanish US" },
  { id: "carolina", label: "Carolina — Portuguese BR" },
  { id: "leo", label: "Leo — Portuguese BR" },
];

export const SONIC_VOICE_IDS = new Set(SONIC_VOICES.map((v) => v.id));
