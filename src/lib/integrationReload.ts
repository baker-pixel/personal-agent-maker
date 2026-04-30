export const reloadAfterIntegrationChange = (delayMs = 250) => {
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return;

  window.setTimeout(() => {
    window.location.reload();
  }, delayMs);
};