import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

import {
  projectConfirmationQueueForTrustedActor,
  resolveConfirmationQueueFieldAccess,
} from "../confirmation-queue-projection";
import type { Phase2Action } from "../permissions";
import type { TrustedActorContext } from "../trusted-actor";

const SHOP = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "4".repeat(64),
});

function context(
  role: "owner" | "manager" | "operator" | "viewer",
  permissions?: readonly Phase2Action[],
): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "session-1",
      role,
      policyVersion: 1,
      revocationEpoch: 0,
      ...(permissions ? { permissions } : {}),
    },
    shop: SHOP,
  } as TrustedActorContext;
}

const QUEUE = [
  {
    id: "order-1",
    orderNumber: "ORD-1",
    totalPrice: 3_500,
    wilaya: "Alger",
    phone: "0555000000",
    source: "manual",
    sourceMetadata: JSON.stringify({ authority: "trusted-manual-v1" }),
    version: 2,
    ageMinutes: 130,
    isStale: true,
    ageLabel: "2h 10m",
    customer: { name: "Seller customer", phone: "0666000000" },
  },
] as const;

describe("confirmation queue projection", () => {
  it("redacts viewer contact and money and removes mutation authority", () => {
    const access = resolveConfirmationQueueFieldAccess(context("viewer"));
    const projected = projectConfirmationQueueForTrustedActor(QUEUE, access);

    expect(projected[0]).toMatchObject({
      orderNumber: "ORD-1",
      customerName: null,
      phone: null,
      wilaya: null,
      totalPrice: null,
      canUpdate: false,
      mutationAuthority: "canonical_v1",
    });
  });

  it("preserves owner fields and update controls", () => {
    const access = resolveConfirmationQueueFieldAccess(context("owner"));
    const projected = projectConfirmationQueueForTrustedActor(QUEUE, access);

    expect(projected[0]).toMatchObject({
      customerName: "Seller customer",
      phone: "0666000000",
      wilaya: "Alger",
      totalPrice: 3_500,
      canUpdate: true,
    });
  });

  it("denies a custom actor without orders.read before the query", () => {
    expect(() =>
      resolveConfirmationQueueFieldAccess(
        context("operator", ["shops.read"]),
      ),
    ).toThrow(/orders\.read/);
  });
});
