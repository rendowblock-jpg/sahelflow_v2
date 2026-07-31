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

export function isAuthenticationStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js"
  );
}

/** Setup mode is onboarding only, never authenticated authority. */
export function classifySetupRequestPath(
  pathname: string,
): SetupRequestDecision {
  if (
    isAuthenticationStaticPath(pathname) ||
    pathname === "/setup" ||
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
