import { describe, expect, it } from "vitest";

import { decodeLicenseRequest, encodeLicenseRequest, type LicenseRequest } from "../request-code";

const request: LicenseRequest = {
  workspaceId: "0123456789abcdef0123456789abcdef",
  installationId: "fedcba9876543210fedcba9876543210",
  deviceBinding: `sfdb1_${"a".repeat(64)}`,
  productMajor: 1,
  transferEpoch: 0,
  revocationEpoch: 0,
  recoveryEpoch: 3,
  currentLicenseId: "trial-0123456789",
};

describe("licence request code", () => {
  it("round-trips exactly, tolerating whitespace from chat apps", () => {
    const code = encodeLicenseRequest(request);
    expect(code.startsWith("SFLR1.")).toBe(true);
    expect(decodeLicenseRequest(code)).toEqual(request);
    expect(decodeLicenseRequest(` ${code.slice(0, 20)}\n${code.slice(20)} `)).toEqual(request);
  });

  it("rejects a mistyped or truncated code", () => {
    const code = encodeLicenseRequest(request);
    const [prefix, payload, sum] = code.split(".");
    const tampered = `${prefix}.${payload!.slice(0, -2)}xx.${sum}`;
    expect(() => decodeLicenseRequest(tampered)).toThrow(/checksum/);
    expect(() => decodeLicenseRequest(code.slice(0, -3))).toThrow();
    expect(() => decodeLicenseRequest("hello")).toThrow(/Not a SahelFlow/);
  });

  it("refuses identifiers outside the entitlement grammar", () => {
    expect(() => encodeLicenseRequest({ ...request, deviceBinding: "raw-serial-123" })).toThrow();
    expect(() => encodeLicenseRequest({ ...request, workspaceId: "short" })).toThrow();
  });
});
