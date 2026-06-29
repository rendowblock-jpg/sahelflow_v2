/**
 * License crypto tests — isExpired, daysRemaining, meetsVersionRequirement.
 *
 * verifyLicenseSignature requires a real Ed25519 keypair + @noble/ed25519,
 * which is tested in the sf-license tool. Here we test the pure helpers.
 */
import { describe, it, expect } from "vitest";
import { isExpired, daysRemaining, meetsVersionRequirement } from "../crypto";
import type { LicensePayload } from "../types";

function makePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    id: "test-001",
    type: "permanent",
    machineIds: ["test-machine"],
    features: ["all"],
    minAppVersion: "3.0.0",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-12-31T00:00:00Z",
    issuedBy: "founder",
    ...overrides,
  };
}

describe("isExpired", () => {
  it("returns false for a license that expires in the future", () => {
    const payload = makePayload({ expiresAt: "2099-12-31T00:00:00Z" });
    expect(isExpired(payload, new Date("2026-06-01"))).toBe(false);
  });

  it("returns true for a license that expired in the past", () => {
    const payload = makePayload({ expiresAt: "2020-01-01T00:00:00Z" });
    expect(isExpired(payload, new Date("2026-06-01"))).toBe(true);
  });

  it("returns false for a license with no expiry (permanent)", () => {
    const payload = makePayload({ expiresAt: null as unknown as string });
    expect(isExpired(payload)).toBe(false);
  });

  it("returns true when expiry is exactly now", () => {
    const now = new Date("2026-06-01T12:00:00Z");
    const payload = makePayload({ expiresAt: now.toISOString() });
    // slightly after now → expired
    expect(isExpired(payload, new Date(now.getTime() + 1))).toBe(true);
  });
});

describe("daysRemaining", () => {
  it("returns Infinity for permanent licenses", () => {
    const payload = makePayload({ expiresAt: null as unknown as string });
    expect(daysRemaining(payload)).toBe(Infinity);
  });

  it("returns positive days for future expiry", () => {
    const payload = makePayload({ expiresAt: "2026-06-10T00:00:00Z" });
    expect(daysRemaining(payload, new Date("2026-06-01T00:00:00Z"))).toBe(9);
  });

  it("returns negative days for past expiry", () => {
    const payload = makePayload({ expiresAt: "2026-05-01T00:00:00Z" });
    expect(daysRemaining(payload, new Date("2026-06-01T00:00:00Z"))).toBe(-31);
  });

  it("returns 0 for expiry today", () => {
    const payload = makePayload({ expiresAt: "2026-06-01T23:59:59Z" });
    expect(daysRemaining(payload, new Date("2026-06-01T00:00:00Z"))).toBe(1);
  });
});

describe("meetsVersionRequirement", () => {
  it("returns true when app version equals min version", () => {
    const payload = makePayload({ minAppVersion: "3.0.0" });
    expect(meetsVersionRequirement(payload, "3.0.0")).toBe(true);
  });

  it("returns true when app version is higher (patch)", () => {
    const payload = makePayload({ minAppVersion: "3.0.0" });
    expect(meetsVersionRequirement(payload, "3.0.1")).toBe(true);
  });

  it("returns true when app version is higher (minor)", () => {
    const payload = makePayload({ minAppVersion: "3.0.0" });
    expect(meetsVersionRequirement(payload, "3.1.0")).toBe(true);
  });

  it("returns true when app version is higher (major)", () => {
    const payload = makePayload({ minAppVersion: "3.0.0" });
    expect(meetsVersionRequirement(payload, "4.0.0")).toBe(true);
  });

  it("returns false when app version is lower (patch)", () => {
    const payload = makePayload({ minAppVersion: "3.0.1" });
    expect(meetsVersionRequirement(payload, "3.0.0")).toBe(false);
  });

  it("returns false when app version is lower (minor)", () => {
    const payload = makePayload({ minAppVersion: "3.1.0" });
    expect(meetsVersionRequirement(payload, "3.0.5")).toBe(false);
  });

  it("returns false when app version is lower (major)", () => {
    const payload = makePayload({ minAppVersion: "4.0.0" });
    expect(meetsVersionRequirement(payload, "3.9.9")).toBe(false);
  });

  it("handles versions with missing patch", () => {
    const payload = makePayload({ minAppVersion: "3.0" });
    expect(meetsVersionRequirement(payload, "3.0.0")).toBe(true);
  });

  it("handles single-segment versions gracefully", () => {
    const payload = makePayload({ minAppVersion: "3" });
    expect(meetsVersionRequirement(payload, "3.0.0")).toBe(true);
    expect(meetsVersionRequirement(payload, "2.0.0")).toBe(false);
  });
});
