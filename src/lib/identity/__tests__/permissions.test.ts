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

  it("uses least-privilege identity, collaboration and field presets", () => {
    const owner = resolvePhase2Permissions("owner", null);
    const manager = resolvePhase2Permissions("manager", null);
    const operator = resolvePhase2Permissions("operator", null);
    const viewer = resolvePhase2Permissions("viewer", null);

    expect(owner).toEqual(
      expect.arrayContaining([
        "shops.delete",
        "workgroups.manage",
        "queues.manage",
        "comments.write",
        "conversations.update",
        "conversations.reply",
        "conversations.assign",
        "whatsapp.connection.manage",
        "orders.assign",
        "customers.contact.read",
        "customers.contact.update",
        "orders.financials.read",
        "orders.financials.update",
        "products.manage",
        "products.cost.update",
        "customers.manage",
        "accounting.update",
        "analytics.financials.read",
        "delivery.credentials.manage",
        "automations.manage",
        "backups.restore",
        "data.import",
        "integrations.manage",
        "risk.manage",
        "settings.manage",
        "storefront.manage",
        "storefront.publish",
        "license.manage",
        "approvals.approve",
      ]),
    );
    expect(manager).toEqual(
      expect.arrayContaining([
        "workgroups.manage",
        "queues.manage",
        "comments.write",
        "conversations.update",
        "conversations.reply",
        "conversations.assign",
        "whatsapp.connection.manage",
        "orders.assign",
        "customers.contact.update",
        "orders.financials.read",
        "orders.financials.update",
        "products.manage",
        "products.cost.read",
        "products.cost.update",
        "customers.manage",
        "accounting.update",
        "analytics.financials.read",
        "deliveries.manage",
        "automations.manage",
        "data.export",
        "data.import",
        "risk.manage",
        "settings.manage",
        "storefront.manage",
      ]),
    );
    expect(manager).not.toContain("shops.delete");
    expect(manager).not.toContain("approvals.approve");
    expect(manager).not.toContain("delivery.credentials.manage");
    expect(manager).not.toContain("backups.restore");
    expect(manager).not.toContain("integrations.manage");
    expect(manager).not.toContain("license.manage");
    expect(manager).not.toContain("storefront.publish");
    expect(operator).toEqual(
      expect.arrayContaining([
        "workgroups.read",
        "queues.read",
        "comments.write",
        "conversations.read",
        "conversations.update",
        "conversations.reply",
        "conversations.claim",
        "orders.read",
        "customers.contact.read",
        "customers.contact.update",
        "products.read",
        "customers.manage",
        "deliveries.manage",
        "automations.read",
        "ai.use",
        "risk.read",
      ]),
    );
    expect(operator).not.toContain("conversations.assign");
    expect(operator).not.toContain("whatsapp.connection.manage");
    expect(operator).not.toContain("orders.create");
    expect(operator).not.toContain("orders.assign");
    expect(operator).not.toContain("orders.financials.read");
    expect(operator).not.toContain("orders.financials.update");
    expect(operator).not.toContain("products.manage");
    expect(operator).not.toContain("accounting.read");
    expect(operator).not.toContain("data.export");
    expect(viewer).toEqual(
      expect.arrayContaining([
        "shops.read",
        "workgroups.read",
        "queues.read",
        "comments.read",
        "conversations.read",
        "orders.read",
        "products.read",
        "customers.read",
        "deliveries.read",
        "analytics.read",
        "risk.read",
      ]),
    );
    expect(viewer).not.toContain("comments.write");
    expect(viewer).not.toContain("conversations.update");
    expect(viewer).not.toContain("conversations.reply");
    expect(viewer).not.toContain("customers.contact.read");
    expect(viewer).not.toContain("customers.contact.update");
    expect(viewer).not.toContain("orders.financials.read");
    expect(viewer).not.toContain("orders.financials.update");
    expect(viewer).not.toContain("customers.contact.read");
    expect(viewer).not.toContain("products.cost.read");
    expect(viewer).not.toContain("analytics.financials.read");
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
    expect(hasPhase2Permission(permissions, "queues.manage")).toBe(false);
  });

  it("keeps custom permissions inside role ceilings", () => {
    expectInvalidPolicy(() =>
      resolvePhase2Permissions(
        "operator",
        JSON.stringify(["conversations.assign"]),
      ),
    );
    expectInvalidPolicy(() =>
      resolvePhase2Permissions(
        "viewer",
        JSON.stringify(["comments.write"]),
      ),
    );
    expect(
      resolvePhase2Permissions(
        "operator",
        JSON.stringify(["comments.write", "conversations.claim"]),
      ),
    ).toEqual(["comments.write", "conversations.claim"]);
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
        "orders.assign",
        "approvals.approve",
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
