/**
 * License facade (index.ts) tests — T-AUTH-INFRA.
 *
 * Tests the re-exports: computeMachineId, getMachineFingerprint,
 * issueTrialLicense, verifyLicense, validateOnLaunch.
 *
 * Mocks @/lib/env to control dev bypass + licensePublicKey, and mocks
 * ./license-machine-id + ./license-service to isolate facade logic. A
 * controllable localStorage mock lets us exercise validateOnLaunch's
 * stored-license path.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mutable mock state ───────────────────────────────────────────────────────
const mockState = vi.hoisted(() => ({
  isDev: false,
  licensePublicKey: "",
  machineId: "test-machine-uuid-001",
  validateResult: { status: "valid" as const, message: "ok" },
  issueTrialResult: {
    payload: {
      id: "trial_123",
      type: "trial" as const,
      machineIds: ["test-machine-uuid-001"],
      features: ["all"],
      minAppVersion: "3.0.0",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      issuedBy: "app",
    },
    signature: "self-issued-trial",
  },
}));

// ── Mock @/lib/env ──────────────────────────────────────────────────────────
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  const mockedEnv: typeof actual.env = { ...actual.env };
  Object.defineProperty(mockedEnv, "isDev", {
    get: () => mockState.isDev,
    enumerable: true,
    configurable: true,
  });
  Object.defineProperty(mockedEnv, "licensePublicKey", {
    get: () => mockState.licensePublicKey,
    enumerable: true,
    configurable: true,
  });
  return { ...actual, env: mockedEnv };
});

// ── Mock ./machine-id ────────────────────────────────────────────────────────
vi.mock("../machine-id", () => ({
  getMachineId: vi.fn(async () => mockState.machineId),
}));

// ── Mock ./license-service ──────────────────────────────────────────────────
const serviceMock = vi.hoisted(() => ({
  validateLicense: vi.fn(),
  issueTrial: vi.fn(),
}));

vi.mock("../license-service", () => ({
  validateLicense: serviceMock.validateLicense,
  issueTrial: serviceMock.issueTrial,
}));

// ── Controllable localStorage mock ──────────────────────────────────────────
const storage = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value);
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key);
  }),
  clear: vi.fn(() => storage.clear()),
  key: vi.fn(() => null),
  length: 0,
};
// NOTE: vi.stubGlobal("localStorage", ...) is re-applied in beforeEach below.
// vitest.config.ts sets `unstubGlobals: true`, which restores globals before
// each test — so a module-top-level stub would be gone by the time any test
// runs, and the stored-license path would never read from the mock storage.

import {
  computeMachineId,
  getMachineFingerprint,
  issueTrialLicense,
  verifyLicense,
  validateOnLaunch,
} from "../index";
import type { MachineFingerprint, SignedLicense } from "../types";

beforeEach(() => {
  // Re-stub localStorage for every test (unstubGlobals clears it between tests).
  vi.stubGlobal("localStorage", localStorageMock);
  storage.clear();
  mockState.isDev = false;
  mockState.licensePublicKey = "test-public-key";
  mockState.machineId = "test-machine-uuid-001";
  serviceMock.validateLicense.mockReset();
  serviceMock.issueTrial.mockReset();
  serviceMock.validateLicense.mockResolvedValue({ status: "valid", message: "ok" });
  serviceMock.issueTrial.mockResolvedValue(mockState.issueTrialResult);
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
});

// ── computeMachineId ─────────────────────────────────────────────────────────
describe("computeMachineId", () => {
  it("returns a 64-char hex SHA-256 digest", async () => {
    const fp: MachineFingerprint = {
      cpuId: "cpu-1",
      motherboardId: "mb-1",
      diskId: "disk-1",
      macAddress: "mac-1",
      osGuid: "guid-1",
    };
    const id = await computeMachineId(fp);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same fingerprint yields same id", async () => {
    const fp: MachineFingerprint = {
      cpuId: "cpu-X",
      motherboardId: "mb-X",
      diskId: "disk-X",
      macAddress: "mac-X",
      osGuid: "guid-X",
    };
    const id1 = await computeMachineId(fp);
    const id2 = await computeMachineId(fp);
    expect(id1).toBe(id2);
  });

  it("differs when any fingerprint signal changes", async () => {
    const fp1: MachineFingerprint = {
      cpuId: "cpu-A",
      motherboardId: "mb",
      diskId: "disk",
      macAddress: "mac",
      osGuid: "guid",
    };
    const fp2: MachineFingerprint = { ...fp1, cpuId: "cpu-B" };
    const id1 = await computeMachineId(fp1);
    const id2 = await computeMachineId(fp2);
    expect(id1).not.toBe(id2);
  });
});

// ── getMachineFingerprint ────────────────────────────────────────────────────
describe("getMachineFingerprint", () => {
  it("returns all 5 signals equal to getMachineId() in browser/dev", async () => {
    const fp = await getMachineFingerprint();
    expect(fp.cpuId).toBe(mockState.machineId);
    expect(fp.motherboardId).toBe(mockState.machineId);
    expect(fp.diskId).toBe(mockState.machineId);
    expect(fp.macAddress).toBe(mockState.machineId);
    expect(fp.osGuid).toBe(mockState.machineId);
  });
});

// ── issueTrialLicense ────────────────────────────────────────────────────────
describe("issueTrialLicense", () => {
  it("delegates to issueTrial with the given machineId", async () => {
    const result = await issueTrialLicense("machine-xyz");
    expect(serviceMock.issueTrial).toHaveBeenCalledWith("machine-xyz");
    expect(result).toBe(mockState.issueTrialResult);
  });
});

// ── verifyLicense ────────────────────────────────────────────────────────────
describe("verifyLicense", () => {
  it("delegates to validateLicense with license + machineId + appVersion", async () => {
    const license: SignedLicense = {
      payload: {
        id: "L1",
        type: "permanent",
        machineIds: ["m1"],
        features: ["all"],
        minAppVersion: "3.0.0",
        issuedAt: new Date().toISOString(),
        issuedBy: "founder",
      },
      signature: "sig",
    };
    const result = await verifyLicense(license, "m1", "3.1.0");
    expect(serviceMock.validateLicense).toHaveBeenCalledWith(license, "m1", "3.1.0");
    expect(result).toEqual({ status: "valid", message: "ok" });
  });
});

// ── validateOnLaunch ─────────────────────────────────────────────────────────
describe("validateOnLaunch", () => {
  it("returns valid in dev mode when no public key is configured", async () => {
    mockState.isDev = true;
    mockState.licensePublicKey = "";
    const result = await validateOnLaunch();
    expect(result.status).toBe("valid");
    expect(result.message).toContain("Development mode");
    // Should not have read storage or called any service
    expect(serviceMock.validateLicense).not.toHaveBeenCalled();
    expect(serviceMock.issueTrial).not.toHaveBeenCalled();
  });

  it("issues + stores a trial when no stored license exists", async () => {
    mockState.isDev = false;
    mockState.licensePublicKey = "real-key";
    storage.clear();
    serviceMock.issueTrial.mockResolvedValue(mockState.issueTrialResult);
    // No localStorage entry → falls through to trial issuance
    const result = await validateOnLaunch();
    expect(result.status).toBe("valid");
    expect(result.license).toBeDefined();
    expect(result.daysRemaining).toBe(7);
    expect(serviceMock.issueTrial).toHaveBeenCalledWith(mockState.machineId);
    // Trial was stored to localStorage
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "sahelflow-license",
      expect.any(String),
    );
  });

  it("validates the stored license when one exists", async () => {
    mockState.isDev = false;
    mockState.licensePublicKey = "real-key";
    storage.clear();
    const storedLicense = mockState.issueTrialResult;
    storage.set("sahelflow-license", JSON.stringify(storedLicense));
    serviceMock.validateLicense.mockResolvedValue({
      status: "valid",
      license: storedLicense,
      daysRemaining: 5,
      message: "valid",
    });

    const result = await validateOnLaunch();
    expect(serviceMock.validateLicense).toHaveBeenCalledWith(
      storedLicense,
      mockState.machineId,
      expect.any(String),
    );
    expect(result.status).toBe("valid");
    expect(result.message).toBe("valid");
    // Should NOT have issued a new trial
    expect(serviceMock.issueTrial).not.toHaveBeenCalled();
  });

  it("propagates the invalid status when the stored license is invalid (no auto-trial)", async () => {
    mockState.isDev = false;
    mockState.licensePublicKey = "real-key";
    storage.clear();
    const storedLicense = mockState.issueTrialResult;
    storage.set("sahelflow-license", JSON.stringify(storedLicense));
    serviceMock.validateLicense.mockResolvedValue({
      status: "expired",
      license: storedLicense,
      daysRemaining: -1,
      message: "expired",
    });

    const result = await validateOnLaunch();
    expect(result.status).toBe("expired");
    expect(serviceMock.issueTrial).not.toHaveBeenCalled();
  });

  it("returns invalid when validateLicense throws (fail-closed)", async () => {
    mockState.isDev = false;
    mockState.licensePublicKey = "real-key";
    storage.clear();
    storage.set("sahelflow-license", JSON.stringify(mockState.issueTrialResult));
    serviceMock.validateLicense.mockRejectedValue(new Error("crypto failure"));

    const result = await validateOnLaunch();
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("re-enter");
  });

  it("returns invalid when getMachineId throws (fail-closed)", async () => {
    mockState.isDev = false;
    mockState.licensePublicKey = "real-key";
    const { getMachineId } = await import("../machine-id");
    vi.mocked(getMachineId).mockRejectedValueOnce(new Error("hw error"));

    const result = await validateOnLaunch();
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("machine ID");
  });

  it("returns invalid when issueTrial throws (fail-closed)", async () => {
    mockState.isDev = false;
    mockState.licensePublicKey = "real-key";
    serviceMock.issueTrial.mockRejectedValue(new Error("trial failure"));

    const result = await validateOnLaunch();
    expect(result.status).toBe("invalid");
    expect(result.message).toContain("trial");
  });
});
