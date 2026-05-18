import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

function getConnectSrc() {
  const hosts = [
    "'self'",
    "https://*.supabase.co",
    "https://*.supabase.in",
    "wss://*.supabase.co",
    "wss://*.supabase.in",
    "https://api.groq.com",
    // Sentry error reporting & session replay
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
  ];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const { hostname, protocol } = new URL(supabaseUrl);
      if (!hosts.some((h) => h.includes(hostname))) {
        hosts.push(`${protocol}//${hostname}`);
        if (protocol === "https:") {
          hosts.push(`wss://${hostname}`);
        }
      }
    } catch {
      /* ignore invalid url */
    }
  }
  const evolutionUrl = process.env.EVOLUTION_API_URL;
  if (evolutionUrl) {
    try {
      const { origin } = new URL(evolutionUrl);
      if (!hosts.includes(origin)) hosts.push(origin);
    } catch {
      /* ignore invalid url */
    }
  }
  return hosts.join(" ");
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Supabase Storage (common for product images + store logos)
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },

      // Shopify assets (if you display Shopify-hosted images)
      { protocol: "https", hostname: "cdn.shopify.com" },
    ],
  },
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // 'unsafe-inline' is required by Next.js inline scripts and cannot be
              // removed without a nonce-based CSP refactor. 'strict-dynamic' is added
              // to restrict dynamically-inserted scripts to those loaded by trusted
              // scripts, partially mitigating the risk of 'unsafe-inline'.
              "script-src 'self' 'unsafe-inline' 'strict-dynamic'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' https: data: blob:",
              "font-src 'self'",
              `connect-src ${getConnectSrc()}`,
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Suppress source map upload warnings in dev
  silent: true,

  // Don't upload source maps (no Sentry org token configured yet)
  sourcemaps: {
    disable: true,
  },
});
