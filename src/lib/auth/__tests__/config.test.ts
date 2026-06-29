/**
 * Auth config tests — pure functions, no DB.
 */
import { describe, it, expect } from "vitest";
import {
  AUTH_COOKIE,
  AUTH_SECRET_ENV,
  AUTH_SECRET_SETTING_KEY,
  AUTH_PIN_SETTING_KEY,
  SESSION_TTL_MS,
  PUBLIC_API_ROUTES,
  PUBLIC_PAGES,
  isPublicApiRoute,
  isPublicPage,
} from "../config";

describe("auth config constants", () => {
  it("exports the expected cookie name", () => {
    expect(AUTH_COOKIE).toBe("sf_session");
  });

  it("exports the expected env var name", () => {
    expect(AUTH_SECRET_ENV).toBe("AUTH_SECRET");
  });

  it("exports the expected setting keys", () => {
    expect(AUTH_SECRET_SETTING_KEY).toBe("auth_secret");
    expect(AUTH_PIN_SETTING_KEY).toBe("auth_pin_hash");
  });

  it("session TTL is 7 days", () => {
    expect(SESSION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("isPublicApiRoute", () => {
  it("returns true for /api/auth/* routes", () => {
    expect(isPublicApiRoute("/api/auth/login")).toBe(true);
    expect(isPublicApiRoute("/api/auth/setup")).toBe(true);
    expect(isPublicApiRoute("/api/auth/status")).toBe(true);
  });

  it("returns true for /api/health", () => {
    expect(isPublicApiRoute("/api/health")).toBe(true);
  });

  it("returns true for /api/storefront/submit + /api/storefront/config", () => {
    expect(isPublicApiRoute("/api/storefront/submit")).toBe(true);
    expect(isPublicApiRoute("/api/storefront/config/abc123")).toBe(true);
  });

  it("returns true for /api/qr-image", () => {
    expect(isPublicApiRoute("/api/qr-image")).toBe(true);
  });

  it("returns false for protected routes", () => {
    expect(isPublicApiRoute("/api/orders")).toBe(false);
    expect(isPublicApiRoute("/api/customers")).toBe(false);
    expect(isPublicApiRoute("/api/products")).toBe(false);
    expect(isPublicApiRoute("/api/risk/assess/abc")).toBe(false);
  });
});

describe("isPublicPage", () => {
  it("returns true for /login + /setup", () => {
    expect(isPublicPage("/login")).toBe(true);
    expect(isPublicPage("/setup")).toBe(true);
  });

  it("returns false for dashboard pages", () => {
    expect(isPublicPage("/dashboard")).toBe(false);
    expect(isPublicPage("/orders")).toBe(false);
    expect(isPublicPage("/customers")).toBe(false);
    expect(isPublicPage("/risk")).toBe(false);
  });
});

describe("PUBLIC_API_ROUTES + PUBLIC_PAGES arrays", () => {
  it("contains the expected public API routes", () => {
    expect(PUBLIC_API_ROUTES).toContain("/api/auth");
    expect(PUBLIC_API_ROUTES).toContain("/api/health");
    expect(PUBLIC_API_ROUTES).toContain("/api/storefront/submit");
    expect(PUBLIC_API_ROUTES).toContain("/api/storefront/config");
    expect(PUBLIC_API_ROUTES).toContain("/api/qr-image");
  });

  it("contains the expected public pages", () => {
    expect(PUBLIC_PAGES).toContain("/login");
    expect(PUBLIC_PAGES).toContain("/setup");
  });
});
