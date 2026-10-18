import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SIDECAR_TOKEN_MIN_LENGTH,
  sidecarBearerMatches,
} from "../sidecar-bearer";

/**
 * IDN-11: the WhatsApp sidecar's bearer check used to exist three times
 * (proxy.ts, sidecar-rest-auth.ts and a private copy in message-status). It now
 * lives once. These tests pin the behaviour all three copies shared, and the
 * source checks keep a fourth copy from appearing.
 */
const TOKEN = "f".repeat(64);

describe("sidecarBearerMatches", () => {
  it("accepts the exact token with a Bearer scheme, any case, any whitespace", () => {
    expect(sidecarBearerMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(sidecarBearerMatches(`bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(sidecarBearerMatches(`BEARER   ${TOKEN}`, TOKEN)).toBe(true);
    expect(sidecarBearerMatches(`Bearer\t${TOKEN}`, TOKEN)).toBe(true);
  });

  it("rejects a wrong token of the same length", () => {
    expect(sidecarBearerMatches(`Bearer ${"0".repeat(64)}`, TOKEN)).toBe(false);
  });

  it("rejects a token that is a prefix or an extension of the expected one", () => {
    expect(sidecarBearerMatches(`Bearer ${TOKEN.slice(0, 63)}`, TOKEN)).toBe(false);
    expect(sidecarBearerMatches(`Bearer ${TOKEN}0`, TOKEN)).toBe(false);
  });

  it("rejects a missing header, another scheme and malformed values", () => {
    expect(sidecarBearerMatches(null, TOKEN)).toBe(false);
    expect(sidecarBearerMatches(undefined, TOKEN)).toBe(false);
    expect(sidecarBearerMatches("", TOKEN)).toBe(false);
    expect(sidecarBearerMatches(`Basic ${TOKEN}`, TOKEN)).toBe(false);
    expect(sidecarBearerMatches("Bearer", TOKEN)).toBe(false);
    expect(sidecarBearerMatches("Bearer ", TOKEN)).toBe(false);
    expect(sidecarBearerMatches(TOKEN, TOKEN)).toBe(false);
    expect(sidecarBearerMatches(`Bearer ${TOKEN} extra`, TOKEN)).toBe(false);
    expect(sidecarBearerMatches(`Bearer ${TOKEN} `, TOKEN)).toBe(false);
    expect(sidecarBearerMatches(`Bearer a b`, TOKEN)).toBe(false);
  });

  it("fails closed when no usable expected token is configured", () => {
    expect(sidecarBearerMatches(`Bearer ${TOKEN}`, undefined)).toBe(false);
    expect(sidecarBearerMatches(`Bearer ${TOKEN}`, null)).toBe(false);
    expect(sidecarBearerMatches(`Bearer ${TOKEN}`, "")).toBe(false);
  });

  it("refuses an expected token shorter than the minimum, even when it matches", () => {
    const short = "s".repeat(SIDECAR_TOKEN_MIN_LENGTH - 1);
    expect(sidecarBearerMatches(`Bearer ${short}`, short)).toBe(false);
    const minimum = "s".repeat(SIDECAR_TOKEN_MIN_LENGTH);
    expect(sidecarBearerMatches(`Bearer ${minimum}`, minimum)).toBe(true);
    expect(SIDECAR_TOKEN_MIN_LENGTH).toBe(16);
  });
});

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("the sidecar bearer comparison exists once", () => {
  it("proxy.ts and sidecar-rest-auth.ts both use the shared helper", () => {
    expect(source("src/proxy.ts")).toContain("sidecarBearerMatches(");
    const restAuth = source("src/lib/whatsapp/sidecar-rest-auth.ts");
    expect(restAuth).toContain("sidecarBearerMatches(");
    expect(restAuth).not.toContain("constantTimeEqual");
    // No scheme regex of its own: the literal text `Bearer\s` lives only in the helper.
    expect(restAuth).not.toContain("Bearer\\s");
  });

  it("the sidecar token is not compared by hand in the proxy", () => {
    const proxy = source("src/proxy.ts");
    const start = proxy.indexOf("function hasWhatsAppSidecarCallbackAuthority");
    const end = proxy.indexOf("async function hasMcpAgentTransportAuthority");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const body = proxy.slice(start, end);
    expect(body).not.toContain("constantTimeEqual");
    expect(body).not.toContain("Bearer\\s");
  });

  it("both sidecar callback routes call the shared authenticator and keep no private copy", () => {
    for (const route of [
      "src/app/api/whatsapp/inbound/route.ts",
      "src/app/api/whatsapp/message-status/route.ts",
    ]) {
      const text = source(route);
      expect(text, route).toContain("authenticateWhatsAppSidecar");
      expect(text, route).not.toContain("constantTimeEqual");
      expect(text, route).not.toContain("readFileSync");
      expect(text, route).not.toContain("Bearer\\s");
      expect(text, route).not.toContain("sidecarTokenFile");
    }
  });
});
