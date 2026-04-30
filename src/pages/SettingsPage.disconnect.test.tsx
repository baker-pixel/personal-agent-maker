import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { screen, fireEvent, waitFor } from "@testing-library/dom";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// ---- Mocks ----
const removeAccountMock = vi.fn();
const refreshConnectionsMock = vi.fn();
const toastMock = vi.fn();

const integrationsState: any = {
  integrations: [
    {
      id: "gmail",
      name: "Gmail",
      description: "",
      icon: "mail",
      connected: true,
      connectedAccounts: ["user@example.com"],
      capabilities: [],
      setupSteps: [],
    },
    {
      id: "google-calendar",
      name: "Google Calendar",
      description: "",
      icon: "calendar",
      connected: false,
      connectedAccounts: [],
      capabilities: [],
      setupSteps: [],
    },
  ],
  isConnected: (id: string) =>
    !!integrationsState.integrations.find((i: any) => i.id === id)?.connected,
  removeAccount: removeAccountMock,
  refreshConnections: refreshConnectionsMock,
  toggleConnection: vi.fn(),
};

vi.mock("@/contexts/IntegrationsContext", () => ({
  useIntegrations: () => integrationsState,
}));

vi.mock("@/hooks/useGoogleOAuthPopup", () => ({
  useGoogleOAuthPopup: () => ({ connecting: null, connect: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/contexts/AgentContext", () => ({
  useAgent: () => ({ agentName: "Annie", setAgentName: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: "user@example.com" } } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: "user@example.com" } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      updateUser: vi.fn(),
    },
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

vi.mock("@/components/EmailTriageSettings", () => ({ default: () => null }));
vi.mock("@/components/VoicePersonalizationSection", () => ({ VoicePersonalizationSection: () => null }));
vi.mock("@/components/DailyBriefingRunner", () => ({ default: () => null }));

import SettingsPage from "@/pages/SettingsPage";

const renderPage = () =>
  render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  );

const openConfirmAndClickDisconnect = async () => {
  // Find the X button next to the gmail-connected account row.
  const removeBtns = await screen.findAllByRole("button");
  // The X icon button has no accessible name; locate by being inside the row containing the email.
  const emailRow = screen.getByText("user@example.com").closest("div")!;
  const xBtn = emailRow.querySelector("button")!;
  fireEvent.click(xBtn);
  // Confirm dialog action button
  const disconnectBtn = await screen.findByRole("button", { name: /disconnect/i });
  fireEvent.click(disconnectBtn);
};

describe("SettingsPage disconnect flow", () => {
  beforeEach(() => {
    removeAccountMock.mockReset();
    refreshConnectionsMock.mockReset();
    toastMock.mockReset();
  });

  it("clears loading state and closes dialog after successful disconnect", async () => {
    removeAccountMock.mockResolvedValue(undefined);
    refreshConnectionsMock.mockResolvedValue(undefined);

    renderPage();
    await openConfirmAndClickDisconnect();

    await waitFor(() => {
      expect(removeAccountMock).toHaveBeenCalledWith("gmail", "user@example.com");
    });
    await waitFor(() => {
      expect(refreshConnectionsMock).toHaveBeenCalled();
    });
    // Dialog should close — "Disconnecting..." text gone.
    await waitFor(() => {
      expect(screen.queryByText(/disconnecting\.\.\./i)).not.toBeInTheDocument();
    });
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Google account disconnected" })
    );
  });

  it("clears loading state even when refreshConnections throws", async () => {
    removeAccountMock.mockResolvedValue(undefined);
    refreshConnectionsMock.mockRejectedValue(new Error("network down"));

    renderPage();
    await openConfirmAndClickDisconnect();

    await waitFor(() => {
      expect(refreshConnectionsMock).toHaveBeenCalled();
    });
    // Despite refresh throwing, dialog must close and loader must clear.
    await waitFor(() => {
      expect(screen.queryByText(/disconnecting\.\.\./i)).not.toBeInTheDocument();
    });
    // Success toast still fired because removeAccount succeeded.
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Google account disconnected" })
    );
  });

  it("shows error toast and still clears loading state when removeAccount throws", async () => {
    removeAccountMock.mockRejectedValue(new Error("revoke failed"));
    refreshConnectionsMock.mockResolvedValue(undefined);

    renderPage();
    await openConfirmAndClickDisconnect();

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Failed to disconnect", variant: "destructive" })
      );
    });
    // refreshConnections must still run in finally block.
    expect(refreshConnectionsMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.queryByText(/disconnecting\.\.\./i)).not.toBeInTheDocument();
    });
  });
});
