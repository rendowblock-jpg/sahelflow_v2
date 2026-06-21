import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tauri wraps the Next.js output. Static export is NOT used because the app
  // needs server-side Prisma access during development; in production Tauri
  // serves the built assets and the "server" runs in-process.
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Ensure server-only code never leaks into client bundles
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
