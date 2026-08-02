import { describe, expect, it } from "vitest";

import { isPublicApiRoute } from "../config";
import {
  classifySetupRequestPath,
  isAuthenticationStaticPath,
} from "../setup-containment";

describe("setup request containment", () => {
  it.each([
    "/setup",
    "/api/auth/setup",
    "/api/auth/status",
    "/api/health",
    "/_next/static/chunk.js",
    "/manifest.webmanifest",
    "/sw.js",
  ])("allows only explicit setup resources: %s", (pathname) => {
    expect(classifySetupRequestPath(pathname)).toEqual({ kind: "allow" });
  });

  it.each([
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/change-pin",
    "/api/auth/reauthenticate",
    "/api/orders",
    "/api/storefront/submit",
  ])("rejects non-setup APIs before authentication: %s", (pathname) => {
    expect(classifySetupRequestPath(pathname)).toEqual({
      kind: "reject_api",
      code: "AUTH_SETUP_REQUIRED",
      status: 409,
    });
  });

  it.each(["/", "/login", "/orders", "/storefront/example", "/setup/profile"])(
    "redirects non-setup pages: %s",
    (pathname) => {
      expect(classifySetupRequestPath(pathname)).toEqual({
        kind: "redirect_setup",
        destination: "/setup",
      });
    },
  );

  it("does not expose the complete auth namespace publicly", () => {
    expect(isPublicApiRoute("/api/auth/login")).toBe(true);
    expect(isPublicApiRoute("/api/auth/status")).toBe(true);
    expect(isPublicApiRoute("/api/auth/change-pin")).toBe(false);
    expect(isPublicApiRoute("/api/auth/reauthenticate")).toBe(false);
    expect(isPublicApiRoute("/api/authors")).toBe(false);
  });

  it("recognizes only browser resources needed before auth", () => {
    expect(isAuthenticationStaticPath("/sw.js")).toBe(true);
    expect(isAuthenticationStaticPath("/manifest.webmanifest")).toBe(true);
    expect(isAuthenticationStaticPath("/orders")).toBe(false);
  });
});
