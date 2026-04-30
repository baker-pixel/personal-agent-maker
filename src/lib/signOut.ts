import { supabase } from "@/integrations/supabase/client";
import { clearStoredPasswordRecoveryParams } from "@/lib/passwordRecovery";

/**
 * Centralized sign-out: terminates the Supabase session, wipes any locally
 * cached app state, and hard-redirects to the landing page so no protected
 * route data lingers in memory and the back button can't restore it.
 */
export async function performSignOut(redirectTo: string = "/") {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn("Sign-out request failed, clearing local state anyway", err);
  }

  try {
    clearStoredPasswordRecoveryParams();
  } catch {
    // ignore
  }

  // Wipe app-level cached state. Supabase SDK clears its own auth keys via
  // signOut(); this removes app-specific keys we wrote (integration cache,
  // onboarding flags scoped to this session, etc.). We DO NOT call
  // localStorage.clear() to avoid nuking unrelated user preferences.
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("sb-") ||
        k.startsWith("supabase.") ||
        k === "integrations-state" ||
        k.startsWith("normy_pwd_recovery")
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {
    // ignore storage errors (private mode, etc.)
  }

  // Hard redirect so React tree fully unmounts and no protected page is
  // restorable via the back button cache.
  window.location.replace(redirectTo);
}
