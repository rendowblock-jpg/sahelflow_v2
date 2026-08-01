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

  it("uses least-privilege identity and collaboration presets", () => {
    const owner = resolvePhase2Permissions("owner", null);
    const manager = resolvePhase2Permissions("manager", null);
    const operator = resolvePhase2Permissions("operator", null);
    const viewer = resolvePhase2Permissions("viewer", null);

    expect(owner).toEqual(
      expect.arrayContaining([
        "shops.delete",
        "conversations.read",
        "conversations.claim",
        "conversations.assign",
      ]),
    );
    expect(manager).toContain("conversations.assign");
    expect(manager).not.toContain("shops.delete");
    expect(operator).toEqual(
      expect.arrayContaining(["conversations.read", "conversations.claim"]),
    );
    expect(operator).not.toContain("conversations.assign");
    expect(viewer).toEqual(["shops.read", "conversations.read"]);
  });

  it("keeps the compatibility owner read-only until durable authority exists", () => {
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).toEqual(["shops.read"]);
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).not.toContain("shops.create");
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).not.toContain("shops.switch");
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).not.toContain("sessions.revoke");
    expect(COMPATIBILITY_LOCAL_OWNER_ACTIONS).not.toContain(
      "conversations.read",
    );
  });

  it("treats a custom policy as an exact allowlist", () => {
    const permissions = resolvePhase2Permissions(
      "manager",
      JSON.stringify(["conversations.read"]),
    );
    expect(hasPhase2Permission(permissions, "conversations.read")).toBe(true);
    expect(hasPhase2Permission(permissions, "conversations.claim")).toBe(false);
    expect(hasPhase2Permission(permissions, "conversations.assign")).toBe(false);
  });

  it("keeps custom permissions inside role ceilings", () => {
    expectInvalidPolicy(() =>
      resolvePhase2Permissions(
        "operator",
        JSON.stringify(["conversations.assign"]),
      ),
    );
    expect(
      resolvePhase2Permissions(
        "operator",
        JSON.stringify(["conversations.claim"]),
      ),
    ).toEqual(["conversations.claim"]);
  });

  it("fails closed for malformed or unknown permissions", () => {
    expectInvalidPolicy(() => resolvePhase2Permissions("manager", "not-json"));
    expectInvalidPolicy(() =>
      resolvePhase2Permissions("manager", JSON.stringify(["future.action"])),
    );
    expectInvalidPolicy(() =>
      resolvePhase2Permissions("manager", JSON.stringify(["shops.delete"])),
    );
  });

  it("does not let a stored custom policy reduce owner recovery authority", () => {
    expect(resolvePhase2Permissions("owner", "[]")).toEqual(
      expect.arrayContaining([
        "members.manage",
        "devices.manage",
        "sessions.revoke",
        "conversations.assign",
      ]),
    );
  });

  it("uses durable person identity rather than membership identity in audit", () => {
    expect(
      trustedActorAuditIdentity({
        kind: "person",
        personId: "person-1",
        workspaceMemberId: "membership-should-not-be-used",
        deviceId: "device-1",
        sessionId: "session-1",
        role: "manager",
        policyVersion: 2,
        revocationEpoch: 0,
      }),
    ).toBe("person:person-1");
  });
});
