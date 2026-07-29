import { describe, expect, it, vi } from "vitest";

import type { ShopContext } from "@/lib/shops/context";
import {
  resolveSessionAuthority,
  type ResolveSessionAuthorityInput,
} from "../session-authority";
import {
  createCompatibilityLocalOwnerContext,
  isTrustedActorContext,
} from "../trusted-actor";

const baseInput = (): ResolveSessionAuthorityInput => ({
  token: "signed-token",
  secret: "session-secret",
  authSetup: true,
  verifyToken: vi.fn(async () => true),
  getSessionId: vi.fn(() => "session-1"),
  findSession: vi.fn(async () => ({ id: "session-1", revokedAt: null })),
});

const shop: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 7,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});

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

describe("createCompatibilityLocalOwnerContext", () => {
  it("binds the exact session and complete trusted ShopContext without inventing person identity", () => {
    const context = createCompatibilityLocalOwnerContext("session-1", shop);

    expect(context).toEqual({
      version: 1,
      actor: {
        kind: "compatibility_local_owner",
        role: "owner",
        sessionId: "session-1",
        compatibilityOnly: true,
      },
      shop,
    });
    expect("personId" in context.actor).toBe(false);
    expect(isTrustedActorContext(context)).toBe(true);
  });

  it("refuses empty or normalized session IDs", () => {
    expect(() => createCompatibilityLocalOwnerContext("   ", shop)).toThrow(
      "requires an exact session ID",
    );
    expect(() => createCompatibilityLocalOwnerContext(" session-1 ", shop)).toThrow(
      "requires an exact session ID",
    );
  });

  it("captures an immutable ShopContext snapshot", () => {
    const mutableShop = { ...shop };
    const context = createCompatibilityLocalOwnerContext("session-1", mutableShop);

    mutableShop.shopId = "changed-after-authority-resolution";

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
      shop,
    };

    expect(isTrustedActorContext(lookalike)).toBe(false);
  });
});
