import { createRoot } from "react-dom/client";
import "./index.css";
import { preparePasswordRecoveryUrlForManualHandling } from "./lib/passwordRecovery";

const rootElement = document.getElementById("root");

const renderStartupFallback = () => {
  if (!rootElement) return;
  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:hsl(38 42% 94%);color:hsl(218 30% 18%);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;text-align:center;">
      <div style="max-width:360px;">
        <div style="width:32px;height:32px;border:2px solid hsl(8 82% 64% / .28);border-top-color:hsl(8 82% 64%);border-radius:999px;margin:0 auto 16px;animation:normy-spin 1s linear infinite;"></div>
        <style>@keyframes normy-spin{to{transform:rotate(360deg)}}</style>
        <p style="font-size:16px;font-weight:650;margin:0 0 6px;">Reconnecting to Normy…</p>
        <p style="font-size:13px;line-height:1.5;margin:0;color:hsl(218 16% 42%);">The preview server restarted. Refresh this page if it does not reconnect automatically.</p>
      </div>
    </div>
  `;
};

const importApp = async (attempt = 0): Promise<typeof import("./App")> => {
  try {
    return await import("./App.tsx");
  } catch (error) {
    if (attempt >= 4) throw error;
    renderStartupFallback();
    await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
    return importApp(attempt + 1);
  }
};

// PWA: Prevent service worker issues in Lovable preview/iframe
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) =>
      console.warn('SW registration failed:', err)
    );
  });
}

preparePasswordRecoveryUrlForManualHandling();

importApp()
  .then(({ default: App }) => {
    if (!rootElement) throw new Error("Root element not found");
    createRoot(rootElement).render(<App />);
  })
  .catch((error) => {
    console.error("Failed to start Normy", error);
    renderStartupFallback();
  });
