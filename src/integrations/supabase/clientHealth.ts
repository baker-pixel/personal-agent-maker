// Hang escalation shared between the supabase client and the resume watchdog.
//
// The watchdog (useClientHealthWatchdog) probes the client when the app comes
// back to the foreground — but a hang can develop *after* that probe passes
// (lock orphaned later, socket dying mid-session). Real app queries are the
// best probe we have, so hung fetches report here and after a few consecutive
// hangs the watchdog re-runs its probe-and-reload cycle.
//
// Lives in its own module (not the watchdog) so client.ts can import it
// without a client.ts ↔ watchdog import cycle.

const HANG_THRESHOLD = 3;

let consecutiveHangs = 0;
let onPoisoned: (() => void) | null = null;

// Registered once by useClientHealthWatchdog on mount.
export function registerPoisonHandler(fn: () => void) {
  onPoisoned = fn;
}

// Call when a supabase request hung until a timeout fired (TimeoutError /
// race timeout) — NOT for HTTP or PostgREST errors, which prove the
// connection is alive.
export function reportClientHang() {
  consecutiveHangs += 1;
  if (consecutiveHangs < HANG_THRESHOLD) return;
  consecutiveHangs = 0;
  onPoisoned?.();
}

export function reportClientOk() {
  consecutiveHangs = 0;
}
