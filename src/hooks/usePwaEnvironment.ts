import { useEffect, useState } from "react";

/**
 * Detects PWA / standalone runtime conditions that affect voice features.
 *
 * Notes on iOS:
 * - SpeechSynthesis works in standalone PWAs but requires a user-gesture
 *   "unlock" (a silent utterance) before it will speak reliably.
 * - SpeechRecognition (webkitSpeechRecognition) is NOT available in iOS
 *   standalone PWAs as of iOS 17 — only in Safari tabs. We must detect this
 *   and surface a graceful fallback.
 */
export function usePwaEnvironment() {
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
    setIsIOS(iOS);

    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS-specific
      (window.navigator as any).standalone === true;
    setIsStandalone(!!standalone);
  }, []);

  // Speech Recognition availability varies by context. iOS PWA standalone
  // does not expose webkitSpeechRecognition at all.
  const hasSpeechRecognition =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const hasSpeechSynthesis =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Known limitation: iOS standalone PWA blocks SpeechRecognition.
  const speechRecognitionBlockedByPwa = isIOS && isStandalone && !hasSpeechRecognition;

  return {
    isStandalone,
    isIOS,
    hasSpeechRecognition,
    hasSpeechSynthesis,
    speechRecognitionBlockedByPwa,
  };
}
