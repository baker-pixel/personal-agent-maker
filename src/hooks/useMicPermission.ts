import { useState, useCallback } from "react";

export type MicPermissionState = "unknown" | "prompt" | "granted" | "denied";

const STORAGE_KEY = "micPermission";

function readStored(): MicPermissionState {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "granted" || v === "denied") return v;
  } catch { /* ignore */ }
  return "unknown";
}

export function useMicPermission() {
  const [state, setState] = useState<MicPermissionState>(readStored);

  // Call this from a user-gesture handler (tap/click).
  // Returns true if permission was granted, false if denied.
  const request = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("denied");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Release immediately — we only need the permission grant, not the stream
      stream.getTracks().forEach((t) => t.stop());
      localStorage.setItem(STORAGE_KEY, "granted");
      setState("granted");
      return true;
    } catch {
      localStorage.setItem(STORAGE_KEY, "denied");
      setState("denied");
      return false;
    }
  }, []);

  // Call when user manually re-enables in Settings and returns to the app
  const recheck = useCallback(async () => {
    if (!navigator.permissions) return;
    try {
      const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
      if (status.state === "granted") {
        localStorage.setItem(STORAGE_KEY, "granted");
        setState("granted");
      } else if (status.state === "denied") {
        localStorage.setItem(STORAGE_KEY, "denied");
        setState("denied");
      }
    } catch { /* permissions API not supported (Safari) */ }
  }, []);

  return { state, request, recheck };
}
