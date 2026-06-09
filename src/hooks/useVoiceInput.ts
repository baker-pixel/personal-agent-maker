import { useSpeechRecognition } from "./useSpeechRecognition";

export function useVoiceInput(onResult: (text: string) => void) {
  const { isListening, isSupported, startListening, stopListening, stopAndSubmit } = useSpeechRecognition({
    continuous: true,
    pushToTalk: true,
    silenceTimeoutMs: 0,
    onResult,
  });

  return { isListening, isSupported, startListening, stopListening, stopAndSubmit };
}
