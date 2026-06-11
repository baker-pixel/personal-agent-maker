import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registerPoisonHandler } from "@/integrations/supabase/clientHealth";

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

// Must comfortably exceed the auth lock steal timeout (lockAcquireTimeout:
// 2000 in client.ts) — an orphaned lock is stolen at 2s and getSession then
// proceeds, so a tighter probe would misread a *recovering* client as dead.
const PROBE_TIMEOUT_MS = 5_000;
// A failed probe right after resume is often just the radio waking up, not a
// poisoned client. Wait and confirm with a second probe before the
// user-visible reload.
const RECHECK_DELAY_MS = 5_000;
// Network probe is more generous — on resume the radio may take a moment to
// wake, and we only want to reload on a genuine hang, not a slow first packet.
const NETWORK_PROBE_TIMEOUT_MS = 8_000;
// Don't reload more than once per window — guards against a reload loop if
// the probe fails for an unrelated reason (e.g. fully offline).
const RELOAD_COOLDOWN_MS = 30_000;
const RELOAD_STAMP_KEY = "normy_watchdog_reload_at";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);
}

async function probeClient(): Promise<boolean> {
  // Stage 1: auth lock. getSession() can resolve from memory, so passing this
  // only proves the lock isn't held — not that the network path works.
  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null;
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), PROBE_TIMEOUT_MS, "auth probe");
    session = data.session;
  } catch {
    return false;
  }

  // Stage 2: if the token expired while suspended, force a refresh now —
  // otherwise the next real query 401s or hangs inside its own refresh.
  try {
    const expiresAt = (session?.expires_at ?? 0) * 1000;
    if (session && expiresAt && expiresAt - Date.now() < 60_000) {
      await withTimeout(supabase.auth.refreshSession(), NETWORK_PROBE_TIMEOUT_MS, "token refresh");
    }
  } catch {
    return false;
  }

  // Stage 3: real network round-trip through the same client the app uses.
  // Catches dead sockets / poisoned connections that the auth probe can't see.
  // Only a hang/abort fails the probe — an HTTP error still proves the
  // connection is alive.
  try {
    await withTimeout(
      Promise.resolve(
        supabase.from("chat_conversations").select("id", { head: true, count: "exact" }).limit(1)
      ),
      NETWORK_PROBE_TIMEOUT_MS,
      "network probe"
    );
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
  } catch {
    /* ignore sessionStorage access failures */
  }
  console.warn("Supabase client unresponsive after resume — reloading");
  // Brief heads-up so the reload reads as recovery, not a glitch. The PWA is
  // precached, so the reload itself is near-instant and lands on the same route.
  toast.info("Reconnecting…", { duration: 1_000 });
  setTimeout(() => window.location.reload(), 1_000);
}

// Only probe after a meaningful suspend — quick tab flicks can't poison the
// client, and probing every visibility change would spam HEAD queries.
const MIN_HIDDEN_MS = 30_000;

export function useClientHealthWatchdog() {
  useEffect(() => {
    let probing = false;
    let hiddenAt = 0;
    let periodicTimer: ReturnType<typeof setInterval> | null = null;

    const checkHealth = async () => {
      if (probing || document.visibilityState !== "visible") return;
      probing = true;
      try {
        if (await probeClient()) return;
        // Double-check: give the network a moment, then probe again. Only a
        // client that fails twice in a row earns the reload.
        await new Promise((r) => setTimeout(r, RECHECK_DELAY_MS));
        if (document.visibilityState !== "visible") return;
        if (await probeClient()) return;
        reloadOnce();
      } finally {
        probing = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= MIN_HIDDEN_MS) checkHealth();
    };
    // pageshow with persisted=true means a bfcache restore — same stale-client
    // risk as a visibility resume, but visibilitychange may not fire.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) checkHealth();
    };

    const onFocus = () => {
      if (document.visibilityState === "visible") checkHealth();
    };

    const startPeriodicProbe = () => {
      if (periodicTimer) return;
      periodicTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void checkHealth();
        }
      }, 2 * 60_000);
    };
    startPeriodicProbe();

    // Hang escalation: real queries reporting consecutive timeouts (via
    // clientHealth) mean the client poisoned itself *after* the resume probe
    // passed — re-probe immediately instead of waiting for the next interval.
    registerPoisonHandler(() => void checkHealth());

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      if (periodicTimer) clearInterval(periodicTimer);
    };
  }, []);
}
