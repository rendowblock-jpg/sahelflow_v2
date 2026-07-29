import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveSessionAuthority,
  type ResolveSessionAuthorityInput,
} from "../session-authority";

const trustedActorHarness = vi.hoisted(() => ({
  authority: {
    status: "authenticated",
    sessionId: "session-1",
  } as unknown,
  shop: {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "default",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 7,
    databaseFileId: "default.db",
    migrationSetSha256: "4".repeat(64),
  },
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentSessionAuthority: vi.fn(async () => trustedActorHarness.authority),
}));

vi.mock("@/lib/db", () => ({
  shopContext: trustedActorHarness.shop,
}));

import * as trustedActorModule from "../trusted-actor";

const baseInput = (): ResolveSessionAuthorityInput => ({
  token: "signed-token",
  secret: "session-secret",
  authSetup: true,
  verifyToken: vi.fn(async () => true),
  getSessionId: vi.fn(() => "session-1"),
  findSession: vi.fn(async () => ({ id: "session-1", revokedAt: null })),
});

const resetTrustedActorHarness = () => {
  trustedActorHarness.authority = {
    status: "authenticated",
    sessionId: "session-1",
  };
  Object.assign(trustedActorHarness.shop, {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "default",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 7,
    databaseFileId: "default.db",
    migrationSetSha256: "4".repeat(64),
  });
};

beforeEach(resetTrustedActorHarness);

describe("resolveSessionAuthority", () => {
  it("distinguishes genuine pre-setup mode from authentication", async () => {
    const result = await resolveSessionAuthority({
      ...baseInput(),
      token: undefined,
      secret: null,
      authSetup: false,
    });

    expect(result).toEqual({ status: "setup" });
  });

  it("fails closed when auth is configured but the signing secret is unavailable", async () => {
    const result = await resolveSessionAuthority({
      ...baseInput(),
      secret: null,
      authSetup: true,
    });

    expect(result).toEqual({
      status: "rejected",
      code: "AUTH_SECRET_UNAVAILABLE",
    });
  });

  it("requires a session token", async () => {
    const result = await resolveSessionAuthority({
      ...baseInput(),
      token: undefined,
    });

    expect(result).toEqual({ status: "rejected", code: "SESSION_REQUIRED" });
  });

  it("rejects an invalid or unverifiable token", async () => {
    const result = await resolveSessionAuthority({
      ...baseInput(),
      verifyToken: vi.fn(async () => false),
    });

    expect(result).toEqual({ status: "rejected", code: "SESSION_INVALID" });
  });

  it("rejects legacy tokens that have no revocable session ID", async () => {
    const result = await resolveSessionAuthority({
      ...baseInput(),
      getSessionId: vi.fn(() => null),
    });

    expect(result).toEqual({
      status: "rejected",
      code: "LEGACY_SESSION_UNSUPPORTED",
    });
  });

  it("rejects a non-exact session ID before reading the authority store", async () => {
    const findSession = vi.fn(async () => ({ id: "session-1", revokedAt: null }));
    const result = await resolveSessionAuthority({
      ...baseInput(),
      getSessionId: vi.fn(() => " session-1 "),
      findSession,
    });

    expect(result).toEqual({ status: "rejected", code: "SESSION_INVALID" });
    expect(findSession).not.toHaveBeenCalled();
  });

  it("rejects a session missing from the authority store", async () => {
    const result = await resolveSessionAuthority({
      ...baseInput(),
      findSession: vi.fn(async () => null),
    });

    expect(result).toEqual({ status: "rejected", code: "SESSION_NOT_FOUND" });
  });

  it("rejects a revoked session", async () => {
    const result = await resolveSessionAuthority({
      ...baseInput(),
      findSession: vi.fn(async () => ({
        id: "session-1",
        revokedAt: new Date("2026-07-29T20:00:00.000Z"),
      })),
    });

    expect(result).toEqual({ status: "rejected", code: "SESSION_REVOKED" });
  });

  it("fails closed when revocation authority cannot be read", async () => {
    const result = await resolveSessionAuthority({
      ...baseInput(),
      findSession: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });

    expect(result).toEqual({
      status: "rejected",
      code: "SESSION_AUTHORITY_UNAVAILABLE",
    });
  });

  it("returns the exact authenticated session ID", async () => {
    const result = await resolveSessionAuthority(baseInput());

    expect(result).toEqual({
      status: "authenticated",
      sessionId: "session-1",
    });
  });
});

describe("requireTrustedActor", () => {
  it("is the only exported minting path", () => {
    expect("createCompatibilityLocalOwnerContext" in trustedActorModule).toBe(false);
    expect(typeof trustedActorModule.requireTrustedActor).toBe("function");
  });

  it("binds the exact authenticated session without inventing person identity", async () => {
    const context = await trustedActorModule.requireTrustedActor();

    expect(context).toEqual({
      version: 1,
      actor: {
        kind: "compatibility_local_owner",
        role: "owner",
        sessionId: "session-1",
        compatibilityOnly: true,
      },
      shop: trustedActorHarness.shop,
    });
    expect("personId" in context.actor).toBe(false);
    expect(trustedActorModule.isTrustedActorContext(context)).toBe(true);
  });

  it("cannot mint authority during setup mode", async () => {
    trustedActorHarness.authority = { status: "setup" };

    await expect(trustedActorModule.requireTrustedActor()).rejects.toMatchObject({
      code: "TRUSTED_ACTOR_REQUIRED",
      statusCode: 401,
    });
  });

  it("cannot mint authority from a rejected or revoked session", async () => {
    trustedActorHarness.authority = {
      status: "rejected",
      code: "SESSION_REVOKED",
    };

    await expect(trustedActorModule.requireTrustedActor()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  });

  it("preserves authority-store failures as service unavailable", async () => {
    trustedActorHarness.authority = {
      status: "rejected",
      code: "SESSION_AUTHORITY_UNAVAILABLE",
    };

    await expect(trustedActorModule.requireTrustedActor()).rejects.toMatchObject({
      code: "SESSION_AUTHORITY_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("refuses a non-exact authenticated session ID", async () => {
    trustedActorHarness.authority = {
      status: "authenticated",
      sessionId: " session-1 ",
    };

    await expect(trustedActorModule.requireTrustedActor()).rejects.toThrow(
      "requires an exact session ID",
    );
  });

  it("captures an immutable ShopContext snapshot", async () => {
    const context = await trustedActorModule.requireTrustedActor();

    trustedActorHarness.shop.shopId = "changed-after-authority-resolution";

    expect(context.shop.shopId).toBe("default");
    expect(Object.isFrozen(context.shop)).toBe(true);
    expect(Object.isFrozen(context.actor)).toBe(true);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("does not trust a structurally identical hand-built object", () => {
    const lookalike = {
      version: 1,
      actor: {
        kind: "compatibility_local_owner",
        role: "owner",
        sessionId: "session-1",
        compatibilityOnly: true,
      },
      shop: trustedActorHarness.shop,
    };

    expect(trustedActorModule.isTrustedActorContext(lookalike)).toBe(false);
  });
});
