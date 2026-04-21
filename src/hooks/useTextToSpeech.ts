import { useState, useCallback, useRef, useEffect } from "react";

export function useTextToSpeech() {
  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem("normy_tts_enabled") === "true";
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    localStorage.setItem("normy_tts_enabled", String(enabled));
  }, [enabled]);

  const stop = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback((text: string, onComplete?: () => void) => {
    if (!isSupported || !enabled) {
      onComplete?.();
      return;
    }

    // Strip markdown formatting for cleaner speech
    const clean = text
      .replace(/#{1,6}\s/g, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .replace(/^[-*•]\s/gm, "")
      .replace(/⚠️/g, "Warning:")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();

    if (!clean) {
      onComplete?.();
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Try to pick a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && v.name.includes("Google")
    ) || voices.find(
      (v) => v.lang.startsWith("en") && !v.localService
    ) || voices.find(
      (v) => v.lang.startsWith("en")
    );
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => { setIsSpeaking(false); onComplete?.(); };
    utterance.onerror = () => { setIsSpeaking(false); onComplete?.(); };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [isSupported, enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) {
        window.speechSynthesis?.cancel();
        setIsSpeaking(false);
      }
      return !prev;
    });
  }, []);

  return { enabled, isSpeaking, isSupported, speak, stop, toggle };
}
