import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "node:child_process";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// Stamped into the bundle so the running app can report which deploy it is.
// Version is "1.<commit count>" — auto-increments on every commit, no manual bump.
const { appVersion, commitHash } = (() => {
  try {
    const count = execSync("git rev-list --count HEAD").toString().trim();
    const hash = execSync("git rev-parse --short HEAD").toString().trim();
    return { appVersion: `1.${count}`, commitHash: hash };
  } catch {
    return { appVersion: "dev", commitHash: "unknown" };
  }
})();
const buildTime = new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // "prompt" lets us show a toast and let the user decide when to reload.
      registerType: "prompt",
      devOptions: { enabled: false },
      // injectManifest: we own the SW source (src/sw.ts) — Workbox injects
      // the precache manifest into it. Push notification handlers live there too.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["icon-192-v2.png", "icon-512-v2.png", "icon-maskable-512-v2.png", "apple-touch-icon.png", "offline.html"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      manifest: {
        name: "Normy — AI Executive Assistant",
        short_name: "Normy",
        description: "Your AI-powered executive assistant for email, calendar, and productivity.",
        theme_color: "#1a1f2e",
        background_color: "#1a1f2e",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        categories: ["productivity", "business"],
        shortcuts: [
          {
            name: "Chat with Normy",
            short_name: "Chat",
            url: "/decision/text",
            icons: [{ src: "/icon-192-v2.png", sizes: "192x192" }],
          },
          {
            name: "Email Triage",
            short_name: "Email",
            url: "/email",
            icons: [{ src: "/icon-192-v2.png", sizes: "192x192" }],
          },
        ],
        icons: [
          {
            src: "/icon-192-v2.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512-v2.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icon-maskable-512-v2.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
