import { createContext, useContext } from "react";
import type { AppState, IntegrationState } from "@/lib/appStateMachine";

// Thin bridge: App.tsx runs useAppStateMachine and publishes here.
// Contexts (Integrations, Agent) read from this instead of owning auth subscriptions.

interface AppStateContextType {
  state: AppState;
  fetchIntegrations: () => Promise<IntegrationState>;
  markOnboardingComplete: () => void;
}

export const AppStateContext = createContext<AppStateContextType | null>(null);

export function useAppState(): AppStateContextType {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState called outside AppStateContext.Provider");
  return ctx;
}
