/**
 * License service validation tests (TEST-004).
 *
 * Tests the full validateLicense flow: trial invariants (fail-closed on
 * tampering), real Ed25519-signed licenses (valid/tampered/wrong machine/
 * expired), and the issueTrial helper.
 *
 * Security-critical: verifies the fail-closed policy — any crypto error or
 * tampering → status "invalid" (never "valid").
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted runs BEFORE vi.mock factories — needed for the mock to access the key
const { TEST_PUBLIC_KEY_B64 } = vi.hoisted(() => ({
  TEST_PUBLIC_KEY_B64: "G4UPIlzhxBt57xY2fQHqhVf1f43YdnHVzEjJCRwe7bQ=",
}));

// Hardcoded test keypair
const TEST_PRIVATE_KEY_HEX = "883e9345ecd41c7cc2d2761720aabada5fd6e1316d6799206cd2707537ea968b";

// Mock env BEFORE importing license-service (env.ts caches at module load)
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      licensePublicKey: TEST_PUBLIC_KEY_B64,
    },
  };
});

import { signAsync, utils } from "@noble/ed25519";

import { validateLicense, issueTrial } from "../license-service";
import type { LicensePayload, SignedLicense } from "../types";

const MACHINE_ID = "test-machine-12345";
const APP_VERSION = "3.1.0";
const TEST_PRIVATE_KEY = new Uint8Array(Buffer.from(TEST_PRIVATE_KEY_HEX, "hex"));

/** Sign a license payload with the test private key (simulates sf-license sign). */
async function signLicense(payload: LicensePayload): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await signAsync(payloadBytes, TEST_PRIVATE_KEY);
  return Buffer.from(signature).toString("base64");
}

function makePayload(opts?: Partial<LicensePayload>): LicensePayload {
  return {
    id: "test-license-001",
    type: "permanent",
    machineIds: [MACHINE_ID],
    features: ["all"],
    minAppVersion: "3.0.0",
    issuedAt: new Date().toISOString(),
    expiresAt: undefined,
    issuedBy: "founder",
    ...opts,
  };
}

describe("validateLicense — trial invariants (SEC-005 fail-closed)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test"); // not dev mode — no bypass
  });

  it("accepts a valid trial (issued now, expires in 7 days, correct machine)", async () => {
    const trial = await issueTrial(MACHINE_ID);
    const result = await validateLicense(trial, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("valid");
    expect(result.daysRemaining).toBeGreaterThan(0);
    expect(result.daysRemaining).toBeLessThanOrEqual(7);
  });

  it("rejects a trial with tampered expiry (expiresAt ≠ issuedAt + 7d)", async () => {
    const trial = await issueTrial(MACHINE_ID);
    const tampered: SignedLicense = {
      ...trial,
      payload: {
        ...trial.payload,
        expiresAt: new Date(
          new Date(trial.payload.issuedAt).getTime() + 8 * 24 * 60 * 60 * 1000
        ).toISOString(),
      },
    };
    const result = await validateLicense(tampered, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("tampered");
  });

  it("rejects a trial with issuedAt in the future (clock manipulation)", async () => {
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const futureExpiry = new Date(
      new Date(futureDate).getTime() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const tampered: SignedLicense = {
      signature: "self-issued-trial",
      payload: makePayload({
        type: "trial",
        issuedAt: futureDate,
        expiresAt: futureExpiry,
      }),
    };
    const result = await validateLicense(tampered, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("future");
  });

  it("rejects a trial with wrong machineId", async () => {
    const trial = await issueTrial(MACHINE_ID);
    const result = await validateLicense(trial, "different-machine", APP_VERSION);
    expect(result.status).toBe("machine_mismatch");
  });

  it("returns 'expired' for a trial that has passed its expiry", async () => {
    const pastDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const pastExpiry = new Date(
      new Date(pastDate).getTime() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const expired: SignedLicense = {
      signature: "self-issued-trial",
      payload: makePayload({
        type: "trial",
        issuedAt: pastDate,
        expiresAt: pastExpiry,
      }),
    };
    const result = await validateLicense(expired, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("expired");
  });
});

describe("validateLicense — real Ed25519-signed licenses", () => {
  it("accepts a valid permanent license", async () => {
    const payload = makePayload({ type: "permanent" });
    const license: SignedLicense = {
      payload,
      signature: await signLicense(payload),
    };
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("valid");
  });

  it("rejects a tampered signature (fail-closed)", async () => {
    const payload = makePayload({ type: "permanent" });
    const license: SignedLicense = {
      payload,
      signature: Buffer.from(new Uint8Array(64)).toString("base64"), // all zeros
    };
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("invalid");
  });

  it("rejects a license signed with a different key", async () => {
    const wrongKey = utils.randomSecretKey();
    const payload = makePayload({ type: "permanent" });
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const sig = await signAsync(payloadBytes, wrongKey);
    const license: SignedLicense = {
      payload,
      signature: Buffer.from(sig).toString("base64"),
    };
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("invalid");
  });

  it("returns 'machine_mismatch' for a license tied to a different machine", async () => {
    const payload = makePayload({ machineIds: ["other-machine"] });
    const license: SignedLicense = {
      payload,
      signature: await signLicense(payload),
    };
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("machine_mismatch");
  });

  it("returns 'expired' for an expired permanent license", async () => {
    const payload = makePayload({
      type: "permanent",
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const license: SignedLicense = {
      payload,
      signature: await signLicense(payload),
    };
    const result = await validateLicense(license, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("expired");
  });
});

describe("issueTrial", () => {
  it("creates a trial with correct 7-day expiry", async () => {
    const before = Date.now();
    const trial = await issueTrial(MACHINE_ID);
    const after = Date.now();

    const issuedMs = new Date(trial.payload.issuedAt).getTime();
    const expiresMs = new Date(trial.payload.expiresAt!).getTime();

    expect(issuedMs).toBeGreaterThanOrEqual(before - 1000);
    expect(issuedMs).toBeLessThanOrEqual(after + 1000);

    const expectedExpiry = issuedMs + 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expiresMs - expectedExpiry)).toBeLessThan(2000);

    expect(trial.signature).toBe("self-issued-trial");
    expect(trial.payload.machineIds).toContain(MACHINE_ID);
    expect(trial.payload.features).toContain("all");
  });

  it("creates a trial that validates as valid", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const trial = await issueTrial(MACHINE_ID);
    const result = await validateLicense(trial, MACHINE_ID, APP_VERSION);
    expect(result.status).toBe("valid");
  });
});
