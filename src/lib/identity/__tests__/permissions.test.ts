import { describe, expect, it } from "vitest";

import {
  COMPATIBILITY_LOCAL_OWNER_ACTIONS,
  hasPhase2Permission,
  resolvePhase2Permissions,
} from "../permissions";
import { trustedActorAuditIdentity } from "../authorization";

describe("Phase 2 permission policy", () => {
  function expectInvalidPolicy(operation: () => unknown): void {
    let error: unknown;
    try {
      operation();
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({
      code: "AUTHORIZATION_POLICY_INVALID",
      statusCode: 503,
    });
  }

  it("uses least-privilege presets", () => {
    expect(resolvePhase2Permissions("owner", null)).toContain("shops.delete");
    expect(resolvePhase2Permissions("manager", null)).not.toContain("shops.delete");
    expect(resolvePhase2Permissions("viewer", null)).toEqual(["shops.read"]);
  });

  it("keeps the compatibility owner read-only until durable authority exists", () => {
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).toEqual(["shops.read"]);
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).not.toContain("shops.create");
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).not.toContain("shops.switch");
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).not.toContain("sessions.revoke");
  });

  it("treats a custom policy as an exact allowlist", () => {
    const permissions = resolvePhase2Permissions(
      "manager",
      JSON.stringify(["shops.read"]),
    );
    expect(hasPhase2Permission(permissions, "shops.read")).toBe(true);
    expect(hasPhase2Permission(permissions, "shops.switch")).toBe(false);
  });

  it("fails closed for malformed or unknown permissions", () => {
    expectInvalidPolicy(() => resolvePhase2Permissions("manager", "not-json"));
    expectInvalidPolicy(() => resolvePhase2Permissions(
      "manager",
      JSON.stringify(["future.action"]),
    ));
    expectInvalidPolicy(() => resolvePhase2Permissions(
      "manager",
      JSON.stringify(["shops.delete"]),
    ));
  });

  it("does not let a stored custom policy reduce owner recovery authority", () => {
    expect(resolvePhase2Permissions("owner", "[]")).toEqual(
      expect.arrayContaining(["members.manage", "devices.manage", "sessions.revoke"]),
    );
  });

  it("uses durable person identity rather than membership identity in audit", () => {
    expect(trustedActorAuditIdentity({
      kind: "person",
      personId: "person-1",
      workspaceMemberId: "membership-should-not-be-used",
      deviceId: "device-1",
      sessionId: "session-1",
      role: "manager",
      policyVersion: 2,
      revocationEpoch: 0,
    })).toBe("person:person-1");
  });
});
