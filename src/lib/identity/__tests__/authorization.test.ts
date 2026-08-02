import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authority: {
    status: "authenticated",
    sessionId: "session-owner",
  } as unknown,
  identity: {
    personId: "5".repeat(32),
    workspaceMemberId: "6".repeat(32),
    deviceId: "7".repeat(32),
    role: "owner" as const,
    policyVersion: 1,
    revocationEpoch: 0,
  },
  resolveDurableIdentityActor: vi.fn(),
  shop: {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "shop-a",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 4,
    databaseFileId: "shop-a.db",
    migrationSetSha256: "4".repeat(64),
  },
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentSessionAuthority: vi.fn(async () => harness.authority),
}));

vi.mock("../control-authority", () => ({
  resolveDurableIdentityActor: harness.resolveDurableIdentityActor,
}));

vi.mock("@/lib/db", () => ({
  shopContext: harness.shop,
}));

import { assertTrustedAction } from "../authorization";
import { requireTrustedActor } from "../trusted-actor";

beforeEach(() => {
  harness.authority = {
    status: "authenticated",
    sessionId: "session-owner",
  };
  harness.resolveDurableIdentityActor.mockReset().mockResolvedValue(harness.identity);
});

describe("process-shop authorization", () => {
  function expectFailure(
    operation: () => void,
    expected: { code: string; statusCode: number },
  ): void {
    let error: unknown;
    try {
      operation();
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject(expected);
  }

  it("allows durable-owner permissions only inside the exact process shop", async () => {
    const context = await requireTrustedActor();

    expect(() =>
      assertTrustedAction(context, "shops.read", { shopId: "shop-a" }),
    ).not.toThrow();
    expect(() =>
      assertTrustedAction(context, "shops.create", { shopId: "shop-a" }),
    ).not.toThrow();
    expect(() =>
      assertTrustedAction(context, "shops.switch", { shopId: "shop-a" }),
    ).not.toThrow();
    expect(() =>
      assertTrustedAction(context, "shops.delete", { shopId: "shop-a" }),
    ).not.toThrow();

    for (const action of [
      "shops.read",
      "shops.switch",
      "shops.delete",
    ] as const) {
      expectFailure(
        () => assertTrustedAction(context, action, { shopId: "shop-b" }),
        { code: "ACTION_FORBIDDEN", statusCode: 403 },
      );
    }
  });

  it("rejects a structurally identical caller-minted context", async () => {
    const trusted = await requireTrustedActor();
    const lookalike = {
      version: trusted.version,
      actor: trusted.actor,
      shop: trusted.shop,
    };

    expectFailure(
      () =>
        assertTrustedAction(lookalike as typeof trusted, "shops.read", {
          shopId: "shop-a",
        }),
      {
        code: "TRUSTED_ACTOR_REQUIRED",
        statusCode: 401,
      },
    );
  });
});
