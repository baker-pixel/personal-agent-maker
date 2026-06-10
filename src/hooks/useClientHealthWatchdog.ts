import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// After a background suspend (iOS PWA eviction, desktop tab freezing) the
// supabase-js client can deadlock: auth uses a Web Lock (navigatorLock), and a
// token refresh interrupted mid-flight leaves the lock held — every subsequent
// query awaits getSession() and hangs until a full page reload creates a fresh
// JS context. No amount of refetching recovers it from app code.
//
// This watchdog probes the client whenever the app returns to the foreground.
// If getSession() doesn't resolve within PROBE_TIMEOUT_MS the client is
// considered poisoned and we hard-reload — the PWA is precached so the reload
// is near-instant and lands on the same route.

const PROBE_TIMEOUT_MS = 3_000;
// Don't reload more than once per window — guards against a reload loop if
// the probe fails for an unrelated reason (e.g. fully offline).
const RELOAD_COOLDOWN_MS = 30_000;
const RELOAD_STAMP_KEY = "normy_watchdog_reload_at";

async function probeClient(): Promise<boolean> {
  try {
    await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("auth probe timed out")), PROBE_TIMEOUT_MS)
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

function reloadOnce() {
  // Never reload while offline — the fresh page couldn't load either.
  if (!navigator.onLine) return;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
  } catch {}
  console.warn("Supabase client unresponsive after resume — reloading");
  window.location.reload();
}

export function useClientHealthWatchdog() {
  useEffect(() => {
    let probing = false;

    const checkHealth = async () => {
      if (probing || document.visibilityState !== "visible") return;
      probing = true;
      const healthy = await probeClient();
      probing = false;
      if (!healthy) reloadOnce();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkHealth();
    };
    // pageshow with persisted=true means a bfcache restore — same stale-client
    // risk as a visibility resume, but visibilitychange may not fire.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) checkHealth();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
