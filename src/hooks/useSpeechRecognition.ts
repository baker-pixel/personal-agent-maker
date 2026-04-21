import { useState, useEffect, useCallback, useRef } from "react";

interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string) => void;
  onEnd?: () => void;
  continuous?: boolean;
  lang?: string;
}

interface SpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  isSupported: boolean;
}

export function useSpeechRecognition({
  onResult,
  onEnd,
  continuous = true,
  lang = "en-US",
}: UseSpeechRecognitionOptions = {}): SpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const stoppingRef = useRef(false);
  const startingRef = useRef(false);
  const lastFinalRef = useRef<string>("");
  const lastFinalAtRef = useRef<number>(0);

  const SpeechRecognitionAPI =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const isSupported = !!SpeechRecognitionAPI;

  const teardown = useCallback((rec: any) => {
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      rec.onstart = null;
    } catch { /* ignore */ }
  }, []);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    stoppingRef.current = true;
    setIsListening(false);
    if (rec) {
      teardown(rec);
      // abort() halts immediately without firing a final onresult; stop() can flush a late result.
      try { rec.abort(); } catch {
        try { rec.stop(); } catch { /* ignore */ }
      }
    }
    recognitionRef.current = null;
    // Clear stopping flag on next tick so a quick re-start isn't blocked.
    setTimeout(() => { stoppingRef.current = false; }, 0);
  }, [teardown]);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) return;
    if (startingRef.current) return;
    // If something is already running, tear it down first.
    if (recognitionRef.current) {
      teardown(recognitionRef.current);
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    startingRef.current = true;
    stoppingRef.current = false;
    lastFinalRef.current = "";
    lastFinalAtRef.current = 0;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (stoppingRef.current) return; // ignore late results after stop
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const combined = finalTranscript || interimTranscript;
      setTranscript(combined);
      if (finalTranscript) {
        const trimmed = finalTranscript.trim();
        const now = Date.now();
        // Dedupe: ignore identical final chunks fired within 1.5s (some engines double-emit).
        if (trimmed && (trimmed !== lastFinalRef.current || now - lastFinalAtRef.current > 1500)) {
          lastFinalRef.current = trimmed;
          lastFinalAtRef.current = now;
          onResult?.(finalTranscript);
        }
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      setIsListening(false);
      if (!stoppingRef.current) onEnd?.();
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "aborted" && event.error !== "no-speech") {
        console.error("Speech recognition error:", event.error);
      }
      setIsListening(false);
    };

    recognition.onstart = () => {
      startingRef.current = false;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
      setTranscript("");
    } catch (e) {
      // start() throws if already started — clean up.
      startingRef.current = false;
      teardown(recognition);
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [SpeechRecognitionAPI, continuous, lang, onResult, onEnd, teardown]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      const rec = recognitionRef.current;
      if (rec) {
        teardown(rec);
        try { rec.abort(); } catch { /* ignore */ }
        recognitionRef.current = null;
      }
    };
  }, [teardown]);

  return { isListening, transcript, startListening, stopListening, toggleListening, isSupported };
}
