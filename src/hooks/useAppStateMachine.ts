import { useReducer, useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  appStateReducer,
  INITIAL_STATE,
  type IntegrationState,
  type ProfileState,
} from "@/lib/appStateMachine";
import {
  getPasswordRecoveryParams,
  hasStoredPasswordRecovery,
} from "@/lib/passwordRecovery";

const PROFILE_TIMEOUT_MS = 1500;

export function useAppStateMachine() {
  const [state, dispatch] = useReducer(appStateReducer, INITIAL_STATE);

  // isRecovery is computed once on mount (lazy useState), then the
  // PASSWORD_RECOVERY auth event can flip it true as a fallback for
  // implicit-flow recovery links where Supabase clears the URL hash
  // before getPasswordRecoveryParams() would read it.
  const [isRecovery, setIsRecovery] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.location.pathname === "/auth/google/callback") return false;
    return (
      getPasswordRecoveryParams().hasRecoveryIntent ||
      hasStoredPasswordRecovery()
    );
  });

  // Track which userId profile has been fetched for.
  // Prevents duplicate fetches from INITIAL_SESSION + TOKEN_REFRESHED.
  const profileFetchedForRef = useRef<string | null>(null);

  // ── Integrations ────────────────────────────────────────────────────────────
  const fetchIntegrations = useCallback(async (): Promise<IntegrationState> => {
    const empty: IntegrationState = {
      gmailConnected: false,
      calendarConnected: false,
      connectedEmails: [],
    };

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return empty;

    const { data: grants } = await supabase
      .from("nylas_grants")
      .select("email, provider");

    const connectedEmails: string[] = [];
    for (const g of grants ?? []) {
      if (
        g.provider === "google" &&
        g.email &&
        !connectedEmails.includes(g.email)
      ) {
        connectedEmails.push(g.email);
      }
    }

    const connected = connectedEmails.length > 0;
    const integrations: IntegrationState = {
      gmailConnected: connected,
      calendarConnected: connected,
      connectedEmails,
    };
    dispatch({ type: "INTEGRATIONS_UPDATED", integrations });
    return integrations;
  }, []);

  // ── Profile ─────────────────────────────────────────────────────────────────
  const fetchProfile = useCallback(
    async (userId: string) => {
      if (profileFetchedForRef.current === userId) return; // deduplicated
      profileFetchedForRef.current = userId;

      const timeout = new Promise<null>((r) =>
        setTimeout(() => r(null), PROFILE_TIMEOUT_MS)
      );

      try {
        const winner = await Promise.race([
          supabase
            .from("user_preferences")
            .select("agent_name, onboarding_completed, onboarding_step")
            .eq("user_id", userId)
            .maybeSingle(),
          timeout,
        ]);

        if (!winner) {
          // Timed out
          dispatch({ type: "PROFILE_FAILED" });
          return;
        }

        const { data, error } = winner as { data: any; error: any };

        if (error) {
          dispatch({ type: "PROFILE_FAILED" });
          return;
        }

        const profile: ProfileState = {
          agentName: data?.agent_name ?? "Normy Agent",
          onboardingCompleted: data?.onboarding_completed ?? false,
          onboardingStep: data?.onboarding_step ?? 0,
        };

        // Background heal: step says done but flag was never set.
        if (profile.onboardingStep >= 5 && !profile.onboardingCompleted) {
          supabase
            .from("user_preferences")
            .update({
              onboarding_completed: true,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .then(() => {});
        }

        dispatch({ type: "PROFILE_LOADED", profile });
      } catch {
        dispatch({ type: "PROFILE_FAILED" });
      }
    },
    []
  );

  // ── Mark onboarding done (called by Onboarding page) ────────────────────────
  const markOnboardingComplete = useCallback(() => {
    dispatch({ type: "ONBOARDING_COMPLETE" });
  }, []);

  // ── Single auth subscription ─────────────────────────────────────────────────
  // This is the ONLY place in the app that subscribes to auth events.
  // IntegrationsContext and AgentContext no longer subscribe independently.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      switch (event) {
        case "SIGNED_OUT":
          profileFetchedForRef.current = null;
          dispatch({ type: "SIGNED_OUT" });
          try {
            const toRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (!k) continue;
              if (
                k === "agent-name" ||
                k === "normy_agent" ||
                k === "integrations-state" ||
                k.startsWith("normy_")
              ) {
                toRemove.push(k);
              }
            }
            toRemove.forEach((k) => localStorage.removeItem(k));
          } catch {}
          break;

        case "TOKEN_REFRESHED":
          // Session token rotated — update session object, no re-hydration needed.
          if (session) dispatch({ type: "SESSION_REFRESHED", session });
          break;

        case "SIGNED_IN":
          if (session) {
            // Force re-fetch on new sign-in (different user may have logged in).
            profileFetchedForRef.current = null;
            dispatch({ type: "AUTH_RESOLVED", session });
            fetchProfile(session.user.id);
            fetchIntegrations();
          }
          break;

        case "INITIAL_SESSION":
          if (session) {
            dispatch({ type: "AUTH_RESOLVED", session });
            fetchProfile(session.user.id);
            fetchIntegrations();
          } else {
            dispatch({ type: "AUTH_RESOLVED", session: null });
          }
          break;

        case "PASSWORD_RECOVERY":
          // Fallback for implicit-flow recovery links where Supabase clears
          // the URL hash before the computed isRecovery value would see it.
          setIsRecovery(true);
          if (session) {
            // Set session + immediately skip hydration — profile isn't needed
            // for the reset-password page. Both dispatches are batched by React
            // into one render so no spinner flash occurs.
            dispatch({ type: "AUTH_RESOLVED", session });
            dispatch({ type: "PROFILE_FAILED" });
          }
          break;

        default:
          break;
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, fetchIntegrations]);

  return { state, fetchIntegrations, markOnboardingComplete, isRecovery };
}
