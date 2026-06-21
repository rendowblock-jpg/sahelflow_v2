import type { NextConfig } from "next";

/**
 * Production output mode: "standalone".
 *
 * The app uses Next.js API routes + server components (Prisma access, AI
 * extraction, WhatsApp sidecar proxy, encrypted-secret reads). Static export
 * (`output: "export"`) is therefore NOT viable — it would delete the API layer
 * and force a full rewrite to client-only + Tauri Rust commands (ADR-010).
 *
 * `output: "standalone"` produces `.next/standalone/server.js` — a minimal
 * Node/Bun-runnable server. In production, Tauri spawns this server (see
 * src-tauri/src/lib.rs) and the webview loads http://localhost:3000.
 *
 * Build flow (production):
 *   1. `bun run build`           → .next/standalone/ + .next/static/
 *   2. Copy .next/static → .next/standalone/.next/static  (Next.js doesn't do this for you)
 *   3. Copy public/ → .next/standalone/public/
 *   4. `bunx tauri build`        → bundles the standalone server as a Tauri
 *                                  resource + compiles the WhatsApp sidecar
 *   5. Tauri Rust setup hook spawns the server + sidecar on launch
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Ensure server-only code never leaks into client bundles
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
