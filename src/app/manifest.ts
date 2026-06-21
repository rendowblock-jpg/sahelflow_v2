import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes SahelFlow installable as a PWA on Android (and
 * desktop Chromium browsers). Phase 0 #13.
 *
 * The manifest is served at /manifest.webmanifest (Next.js App Router
 * convention: src/app/manifest.ts → /manifest.webmanifest).
 *
 * Installability requirements (Chrome):
 *   - manifest with name + short_name + icons (192 + 512) + start_url + display
 *   - a registered service worker that handles fetch (see public/sw.js)
 *   - served over HTTPS (Tauri uses http://localhost which is also trusted)
 *
 * The app is "installable" but NOT fully "offline-capable" — the API routes
 * (Prisma, AI, WhatsApp sidecar) require the local server. The SW caches the
 * app shell (HTML/CSS/JS) so the UI loads offline, but data-dependent pages
 * show a "connection required" state. This matches the local-first design
 * (the app runs on the seller's machine; "offline" means the server process
 * is down).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SahelFlow — Gestion COD",
    short_name: "SahelFlow",
    description:
      "Back-office intelligent pour vendeurs COD algériens. WhatsApp, livraison, IA.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    categories: ["business", "productivity", "shopping"],
    lang: "fr",
    dir: "auto", // RTL-aware (Arabic UI)
    icons: [
      {
        src: "/icons/icon-1024.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-1024.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-1024.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Boîte de réception",
        short_name: "Inbox",
        description: "Conversations WhatsApp + TikTok",
        url: "/inbox",
      },
      {
        name: "Commandes",
        short_name: "Orders",
        description: "Liste des commandes",
        url: "/orders",
      },
      {
        name: "Assistant IA",
        short_name: "IA",
        description: "Chat avec l'assistant IA (18 outils)",
        url: "/agents",
      },
    ],
  };
}
