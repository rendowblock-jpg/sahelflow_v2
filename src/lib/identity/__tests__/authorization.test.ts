import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authority: {
    status: "authenticated",
    sessionId: "session-owner",
  } as unknown,
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

  it("allows only read access to the exact process shop for the compatibility owner", async () => {
    const context = await requireTrustedActor();

    expect(() => assertTrustedAction(context, "shops.read", {
      shopId: "shop-a",
    })).not.toThrow();
    expectFailure(() => assertTrustedAction(context, "shops.read", {
      shopId: "shop-b",
    }), {
      code: "ACTION_FORBIDDEN",
      statusCode: 403,
    });
    expectFailure(() => assertTrustedAction(context, "shops.switch", {
      shopId: "shop-a",
    }), {
      code: "ACTION_FORBIDDEN",
      statusCode: 403,
    });
  });

  it("rejects a structurally identical caller-minted context", async () => {
    const trusted = await requireTrustedActor();
    const lookalike = {
      version: trusted.version,
      actor: trusted.actor,
      shop: trusted.shop,
    };

    expectFailure(() => assertTrustedAction(
      lookalike as typeof trusted,
      "shops.read",
      { shopId: "shop-a" },
    ), {
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });
  });
});
