import { createRoot } from "react-dom/client";
import "./index.css";
import { preparePasswordRecoveryUrlForManualHandling } from "./lib/passwordRecovery";

// On-device debug console for diagnosing mobile-only issues (resume hangs,
// 401 bursts) where no desktop devtools can attach. Open the site with
// ?debug=1 once to enable (persists via localStorage); ?debug=0 disables.
// Lazy chunk — zero cost unless enabled.
try {
  const dbg = new URLSearchParams(location.search).get("debug");
  if (dbg === "1") localStorage.setItem("normy_debug", "1");
  if (dbg === "0") localStorage.removeItem("normy_debug");
  if (localStorage.getItem("normy_debug") === "1") {
    import("eruda").then(({ default: eruda }) => eruda.init());
  }
} catch { /* storage unavailable — skip */ }

const rootElement = document.getElementById("root");

const renderStartupFallback = () => {
  if (!rootElement) return;
  rootElement.textContent = "";

  const outer = document.createElement("div");
  Object.assign(outer.style, {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "hsl(38 42% 94%)",
    color: "hsl(218 30% 18%)",
    fontFamily: "system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    padding: "24px",
    textAlign: "center",
  });

  const inner = document.createElement("div");
  inner.style.maxWidth = "360px";

  const spinner = document.createElement("div");
  Object.assign(spinner.style, {
    width: "32px",
    height: "32px",
    border: "2px solid hsl(8 82% 64% / .28)",
    borderTopColor: "hsl(8 82% 64%)",
    borderRadius: "999px",
    margin: "0 auto 16px",
    animation: "normy-spin 1s linear infinite",
  });

  const title = document.createElement("p");
  Object.assign(title.style, { fontSize: "16px", fontWeight: "650", margin: "0 0 6px" });
  title.textContent = "Reconnecting to Normy…";

  const subtitle = document.createElement("p");
  Object.assign(subtitle.style, {
    fontSize: "13px",
    lineHeight: "1.5",
    margin: "0",
    color: "hsl(218 16% 42%)",
  });
  subtitle.textContent =
    "The preview server restarted. Refresh this page if it does not reconnect automatically.";

  inner.append(spinner, title, subtitle);
  outer.appendChild(inner);
  rootElement.appendChild(outer);
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

// In preview/iframe, kill any lingering SW so it doesn't interfere with HMR.
// In production, VitePWA handles SW registration automatically.
if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}

preparePasswordRecoveryUrlForManualHandling();

// Capture beforeinstallprompt before any component mounts — event fires once early.
import("./lib/pwaInstallPrompt").then(({ initPwaInstallCapture }) => initPwaInstallCapture());

importApp()
  .then(({ default: App }) => {
    if (!rootElement) throw new Error("Root element not found");
    createRoot(rootElement).render(<App />);
  })
  .catch((error) => {
    console.error("Failed to start Normy", error);
    renderStartupFallback();
  });
