import { useSpeechRecognition } from "./useSpeechRecognition";

export function useVoiceInput(onResult: (text: string) => void) {
  const { isListening, isSupported, startListening, stopListening } = useSpeechRecognition({
    continuous: false,
    silenceTimeoutMs: 5000,
    onResult,
  });

  return { isListening, isSupported, startListening, stopListening };
}
