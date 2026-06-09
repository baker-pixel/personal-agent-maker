import type { Session } from "@supabase/supabase-js";

// ─── Phases ──────────────────────────────────────────────────────────────────
// BOOTING       : before any auth event fires
// UNAUTHENTICATED : no session
// HYDRATING     : session known, profile loading in background (non-blocking)
// ONBOARDING    : profile loaded, onboarding not complete
// READY         : profile loaded, onboarding complete
// ERROR         : unrecoverable failure
export type AppPhase =
  | "BOOTING"
  | "UNAUTHENTICATED"
  | "HYDRATING"
  | "ONBOARDING"
  | "READY"
  | "ERROR";

export interface ProfileState {
  agentName: string;
  onboardingCompleted: boolean;
  onboardingStep: number;
}

export interface IntegrationState {
  gmailConnected: boolean;
  calendarConnected: boolean;
  connectedEmails: string[];
}

export interface AppState {
  phase: AppPhase;
  session: Session | null;
  profile: ProfileState | null; // null = not yet hydrated
  integrations: IntegrationState;
  error: string | null;
}

export type AppAction =
  | { type: "AUTH_RESOLVED"; session: Session | null }
  | { type: "SESSION_REFRESHED"; session: Session }
  | { type: "SIGNED_OUT" }
  | { type: "PROFILE_LOADED"; profile: ProfileState }
  | { type: "PROFILE_FAILED" }
  | { type: "INTEGRATIONS_UPDATED"; integrations: IntegrationState }
  | { type: "ONBOARDING_COMPLETE" }
  | { type: "FATAL_ERROR"; message: string };

const EMPTY_INTEGRATIONS: IntegrationState = {
  gmailConnected: false,
  calendarConnected: false,
  connectedEmails: [],
};

export const INITIAL_STATE: AppState = {
  phase: "BOOTING",
  session: null,
  profile: null,
  integrations: EMPTY_INTEGRATIONS,
  error: null,
};

function derivePhase(
  session: Session | null,
  profile: ProfileState | null
): AppPhase {
  if (!session) return "UNAUTHENTICATED";
  if (!profile) return "HYDRATING";
  const done = profile.onboardingCompleted || profile.onboardingStep >= 5;
  return done ? "READY" : "ONBOARDING";
}

export function appStateReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "AUTH_RESOLVED": {
      if (!action.session) {
        return { ...INITIAL_STATE, phase: "UNAUTHENTICATED" };
      }
      // If same user (token refresh path), keep existing profile to avoid flicker.
      const sameUser = state.session?.user.id === action.session.user.id;
      const profile = sameUser ? state.profile : null;
      return {
        ...state,
        session: action.session,
        profile,
        phase: derivePhase(action.session, profile),
        error: null,
      };
    }

    case "SESSION_REFRESHED": {
      // Token refresh — only update the session object, no phase change.
      return { ...state, session: action.session };
    }

    case "SIGNED_OUT": {
      return { ...INITIAL_STATE, phase: "UNAUTHENTICATED" };
    }

    case "PROFILE_LOADED": {
      return {
        ...state,
        profile: action.profile,
        phase: derivePhase(state.session, action.profile),
        error: null,
      };
    }

    case "PROFILE_FAILED": {
      // On timeout/error: default to NOT onboarded.
      // New users (no DB row yet) must see onboarding — wrong default here
      // would silently skip it. Existing users with a flaky connection will
      // hit onboarding and can navigate away; that's the safer failure mode.
      const fallback: ProfileState = {
        agentName:
          typeof localStorage !== "undefined"
            ? (localStorage.getItem("agent-name") ?? "Normy Agent")
            : "Normy Agent",
        onboardingCompleted: false,
        onboardingStep: 0,
      };
      return {
        ...state,
        profile: fallback,
        phase: derivePhase(state.session, fallback),
      };
    }

    case "INTEGRATIONS_UPDATED": {
      return { ...state, integrations: action.integrations };
    }

    case "ONBOARDING_COMPLETE": {
      const profile: ProfileState = {
        ...(state.profile ?? {
          agentName:
            typeof localStorage !== "undefined"
              ? (localStorage.getItem("agent-name") ?? "Normy Agent")
              : "Normy Agent",
          onboardingStep: 5,
        }),
        onboardingCompleted: true,
        onboardingStep: Math.max(state.profile?.onboardingStep ?? 0, 5),
      };
      return { ...state, profile, phase: "READY" };
    }

    case "FATAL_ERROR": {
      return { ...state, phase: "ERROR", error: action.message };
    }

    default:
      return state;
  }
}
