import { useEffect } from "react";

// Supabase edge functions run in per-function isolates that are evicted after
// a few idle minutes — the next call pays a cold-start (0.5–3s). This hook
// keeps the hot-path isolates warm by pinging each one's `?warmup=1` branch:
//   - on app launch
//   - on return to foreground
//   - every WARM_INTERVAL_MS while the app is visible
// Pings stop automatically while the app is hidden (the browser freezes the
// interval), which is fine — the resume ping covers wake-up.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Each function is its own isolate — warming one does not warm the others.
const HOT_FUNCTIONS = ["chat", "groq-stt", "polly-tts", "groq-tts", "calendar-fetch"];

// Isolates live ~5–10 min idle; 4 min keeps them warm with minimal traffic.
const WARM_INTERVAL_MS = 4 * 60_000;
// Debounce so launch + visibility + interval don't stack pings.
const MIN_GAP_MS = 60_000;

let lastWarmAt = 0;

function warmAll() {
  if (Date.now() - lastWarmAt < MIN_GAP_MS) return;
  lastWarmAt = Date.now();
  for (const fn of HOT_FUNCTIONS) {
    // Fire-and-forget — a failed warmup must never surface to the user.
    fetch(`${SUPABASE_URL}/functions/v1/${fn}?warmup=1`, {
      method: "GET",
      // verify_jwt is on for these functions; the anon key is a valid JWT.
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  }
}

export function useFunctionWarmup() {
  useEffect(() => {
    warmAll();

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") warmAll();
    }, WARM_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") warmAll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
