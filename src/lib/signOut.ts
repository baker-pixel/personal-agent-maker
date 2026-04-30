import { supabase } from "@/integrations/supabase/client";
import { clearStoredPasswordRecoveryParams } from "@/lib/passwordRecovery";

/**
 * Best-effort: revoke + delete every Google OAuth token row tied to the
 * current user before we drop the Supabase session. This guarantees the
 * next sign-in starts from a clean slate (user must re-consent), matching
 * the privacy posture promised in the integrations UI.
 *
 * Failures here are intentionally swallowed — sign-out must always proceed.
 */
async function revokeAndDeleteGoogleTokens() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: tokens } = await supabase
      .from("google_oauth_tokens")
      .select("access_token, refresh_token")
      .eq("user_id", user.id);

    if (tokens?.length) {
      // Revoke in parallel; ignore individual failures.
      await Promise.allSettled(
        tokens.map((t) => {
          const tok = t.refresh_token || t.access_token;
          if (!tok) return Promise.resolve();
          return fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok)}`,
            { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
          ).catch(() => undefined);
        })
      );
    }

    // Delete rows under the user's RLS scope.
    await supabase.from("google_oauth_tokens").delete().eq("user_id", user.id);
  } catch (err) {
    console.warn("revokeAndDeleteGoogleTokens failed (continuing sign-out):", err);
  }
}

/**
 * Centralized sign-out: revokes Google tokens, terminates the Supabase
 * session, wipes locally cached app state, and hard-redirects to the
 * landing page so no protected route data lingers in memory.
 */
export async function performSignOut(redirectTo: string = "/") {
  await revokeAndDeleteGoogleTokens();

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
