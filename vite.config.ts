import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: ["icon-192-v2.png", "icon-512-v2.png", "icon-maskable-512-v2.png", "apple-touch-icon.png", "offline.html"],
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        offlineGoogleAnalytics: false,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
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
