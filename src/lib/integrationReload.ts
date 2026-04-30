/**
 * Previously this helper hard-reloaded the page after any integration
 * connect/disconnect. We now keep the UI in sync by re-fetching authoritative
 * server state via `IntegrationsContext.refreshConnections` (called on mount,
 * on auth events, on window focus, and after every OAuth/disconnect flow).
 *
 * This export is kept as a no-op so existing callers continue to compile
 * without forcing a jarring full-page reload on the user.
 */
export const reloadAfterIntegrationChange = (_delayMs = 250) => {
  // Intentionally a no-op. State sync is handled by IntegrationsContext.
};
