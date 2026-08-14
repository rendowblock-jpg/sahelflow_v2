import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes SahelFlow installable as a PWA on Android (and
 * desktop Chromium browsers). The Founder-provided PNG is the canonical mark
 * and is also the source used by the Tauri icon generator for Windows assets.
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
    background_color: "#101728",
    theme_color: "#39d4bf",
    categories: ["business", "productivity", "shopping"],
    lang: "fr",
    dir: "auto",
    icons: [
      {
        src: "/icons/sahelflow-mark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/sahelflow-mark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Boîte de réception",
        short_name: "Inbox",
        description: "Conversations WhatsApp",
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
