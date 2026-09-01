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
 *
 * Security headers: set on every response. CSP is also enforced by Tauri
 * (see src-tauri/tauri.conf.json) — the Next.js CSP is a defense-in-depth
 * for the dev workflow (browser at localhost:3000).
 */
const securityHeaders = [
  // CSP — the dev server needs 'unsafe-eval' for HMR and 'unsafe-inline' for
  // styled-jsx. The installed WebView enforces this response policy together
  // with Tauri's CSP, so both must allow the native runtime's ephemeral
  // loopback ports. No non-loopback WebSocket origin is permitted here.
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
      "connect-src 'self' ipc: http://ipc.localhost https://generativelanguage.googleapis.com https://api.yalidine.app " +
      "https://api.youcan.shop https://*.myshopify.com https://backend.maystro-delivery.com " +
      "https://b.maystro-delivery.com https://procolis.com ws://127.0.0.1:* ws://localhost:* " +
      "https://*.ingest.sentry.io https://*.sentry.io; " +  // T-H5: Sentry error reporting
      "img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
      "object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // HSTS only meaningful for HTTPS — harmless on localhost HTTP, enforced in
  // production if the app is ever served over HTTPS (e.g. Cloudflare Pages).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Don't allow the webview to be framed by other origins (clickjacking).
  // Campaign row R4/B4 ROOT CAUSE: `microphone=()` disabled the app's OWN
  // first-party microphone use. Chromium enforces the permissions policy
  // BEFORE any OS toggle or WebView2 auto-grant switch, so every getUserMedia
  // call rejected with NotAllowedError no matter what the operator changed in
  // Windows privacy settings — the exact installed failure reproduced across
  // Internal.28/.30/.31. `microphone=(self)` keeps third-party/embedded frames
  // blocked while allowing the same-origin composer voice recorder the app
  // itself ships (#329). Camera and geolocation stay fully denied.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // The standalone server resolves seller dashboard dictionaries at RUNTIME
  // from `resolve(process.cwd(), "src/lib/i18n/locales/<locale>.json")`
  // (src/lib/i18n-server.ts). The generated standalone server.js chdir()s to
  // its own directory at boot, so that path resolves inside the packaged
  // standalone root — but a dynamic fs read cannot be traced automatically.
  // Explicitly include the locale JSONs in every server route trace so
  // `.next/standalone/src/lib/i18n/locales/*.json` always exists at the exact
  // path the runtime reads. `src-tauri/build-frontend.ts` additionally copies
  // the same directory as a deterministic belt-and-suspenders layer.
  // (Route-glob key syntax per the bundled Next 16 docs: `'/*'` = all routes.)
  outputFileTracingIncludes: {
    "/*": ["./src/lib/i18n/locales/*.json"],
  },
  // Type-checking + linting run via sf-verify (NOT during `next build`).
  //
  // Rationale: `next build` spawns a separate worker for `tsc` + eslint.
  // On memory-constrained dev/CI boxes (4 GB RAM, no swap) that worker gets
  // SIGKILL'd by the OOM killer after bundler compilation succeeds —
  // `bun run build` exits 1 even though the bundle compiled cleanly.
  // Phase 2 of the data-integrity plan re-enabled these checks but the OOM
  // makes `next build` non-functional on the founder's deploy box, so we
  // re-disable them here. The canonical type/lint gate is `sf-verify --fast`
  // (tsc --noEmit + eslint .) which runs separately and passes; `next build`
  // is ONLY responsible for producing the standalone bundle.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Note: Next.js 16 removed `next build`'s eslint step entirely (eslint now
  // runs via `next lint` / sf-verify). The legacy `eslint.ignoreDuringBuilds`
  // key is unrecognized and warns — omitted intentionally.
  reactStrictMode: true,
  poweredByHeader: false,
  // Explicit — defaults to false in Next.js, but pin to prevent future
  // regressions that would leak source code via source maps in production.
  productionBrowserSourceMaps: false,
  experimental: {
    // Ensure server-only code never leaks into client bundles
    serverActions: { bodySizeLimit: "10mb" },
    // Tree-shake unused exports from heavy libraries (lucide-react, etc.)
    optimizePackageImports: [
      "lucide-react",
      "recharts",
          ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
