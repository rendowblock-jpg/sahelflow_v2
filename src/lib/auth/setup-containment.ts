export type SetupRequestDecision =
  | Readonly<{ kind: "allow" }>
  | Readonly<{
      kind: "reject_api";
      code: "AUTH_SETUP_REQUIRED";
      status: 409;
    }>
  | Readonly<{ kind: "redirect_setup"; destination: "/setup" }>;

const SETUP_API_ROUTES = new Set([
  "/api/auth/setup",
  "/api/auth/status",
  "/api/health",
]);

function isSetupPage(pathname: string): boolean {
  return pathname === "/setup" || pathname.startsWith("/setup/");
}

/**
 * Static browser resources that must remain available before seller auth exists.
 * The proxy matcher excludes most image/static paths already; this function keeps
 * the remaining manifest/service-worker paths explicit and testable.
 */
export function isAuthenticationStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js"
  );
}

/**
 * Setup mode is not authentication. It exposes only the setup ceremony, its
 * status probe, health, and static resources. Every other API is rejected and
 * every other page is redirected to setup.
 */
export function classifySetupRequestPath(
  pathname: string,
): SetupRequestDecision {
  if (
    isAuthenticationStaticPath(pathname) ||
    isSetupPage(pathname) ||
    SETUP_API_ROUTES.has(pathname)
  ) {
    return { kind: "allow" };
  }

  if (pathname.startsWith("/api/")) {
    return {
      kind: "reject_api",
      code: "AUTH_SETUP_REQUIRED",
      status: 409,
    };
  }

  return { kind: "redirect_setup", destination: "/setup" };
}
