import { describe, expect, it } from "vitest";

import {
  AUTH_COOKIE,
  AUTH_PIN_SETTING_KEY,
  AUTH_SECRET_ENV,
  AUTH_SECRET_SETTING_KEY,
  PUBLIC_API_ROUTES,
  PUBLIC_PAGES,
  SENSITIVE_REAUTH_WINDOW_MS,
  SESSION_ACTIVITY_WRITE_INTERVAL_MS,
  SESSION_INACTIVITY_TIMEOUT_MS,
  SESSION_OVERALL_TIMEOUT_MS,
  SESSION_TTL_MS,
  isPublicApiRoute,
  isPublicPage,
} from "../config";

describe("auth config constants", () => {
  it("exports stable cookie and secret keys", () => {
    expect(AUTH_COOKIE).toBe("sf_session");
    expect(AUTH_SECRET_ENV).toBe("AUTH_SECRET");
    expect(AUTH_SECRET_SETTING_KEY).toBe("auth_secret");
    expect(AUTH_PIN_SETTING_KEY).toBe("auth_pin_hash");
  });

  it("separates cookie lifetime, session freshness and high-risk proof", () => {
    expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(SESSION_OVERALL_TIMEOUT_MS).toBe(24 * 60 * 60 * 1000);
    expect(SESSION_INACTIVITY_TIMEOUT_MS).toBe(60 * 60 * 1000);
    expect(SESSION_ACTIVITY_WRITE_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(SENSITIVE_REAUTH_WINDOW_MS).toBe(10 * 60 * 1000);
    expect(SESSION_ACTIVITY_WRITE_INTERVAL_MS).toBeLessThan(
      SESSION_INACTIVITY_TIMEOUT_MS,
    );
    expect(SENSITIVE_REAUTH_WINDOW_MS).toBeLessThan(
      SESSION_OVERALL_TIMEOUT_MS,
    );
    expect(SESSION_OVERALL_TIMEOUT_MS).toBeLessThan(SESSION_TTL_MS);
  });
});

describe("isPublicApiRoute", () => {
  it.each([
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/setup",
    "/api/auth/status",
    "/api/health",
    "/api/storefront/submit",
    "/api/reports/daily",
  ])("allows the exact public route %s", (pathname) => {
    expect(isPublicApiRoute(pathname)).toBe(true);
  });

  it.each([
    "/api/auth",
    "/api/auth/change-pin",
    "/api/auth/reauthenticate",
    "/api/auth/status/private",
    "/api/health/private",
    "/api/storefront/submit/private",
    "/api/storefront/config",
    "/api/whatsapp/qr-image",
    "/api/orders",
    "/api/customers",
  ])("rejects protected or child route %s", (pathname) => {
    expect(isPublicApiRoute(pathname)).toBe(false);
  });
});

describe("isPublicPage", () => {
  it.each([
    "/login",
    "/setup",
    "/setup/profile",
    "/storefront",
    "/storefront/example",
  ])("allows public page %s", (pathname) => {
    expect(isPublicPage(pathname)).toBe(true);
  });

  it.each(["/dashboard", "/orders", "/customers", "/risk"])(
    "rejects dashboard page %s",
    (pathname) => {
      expect(isPublicPage(pathname)).toBe(false);
    },
  );
});

describe("public authority arrays", () => {
  it("does not expose a namespace prefix", () => {
    expect(PUBLIC_API_ROUTES).not.toContain("/api/auth");
    expect(PUBLIC_API_ROUTES).not.toContain("/api/storefront/config/");
    expect(PUBLIC_API_ROUTES).not.toContain("/api/whatsapp/qr-image");
  });

  it("retains the intended public page roots", () => {
    expect(PUBLIC_PAGES).toEqual(
      expect.arrayContaining(["/login", "/setup", "/storefront"]),
    );
  });
});
