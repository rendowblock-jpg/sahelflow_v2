import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ShopContext } from "@/lib/shops/context";
import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
} from "../control-authority";
import {
  createMemberInvitation,
  listMemberInvitations,
  memberAuthorityMarkerPath,
  memberAuthorityPath,
  revokeMemberInvitation,
  rotateMemberAuthorityAuthentication,
} from "../member-authority";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "a".repeat(32),
  installationId: "b".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "c".repeat(32),
  registryRevision: 7,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "d".repeat(64),
});

const OTHER_SHOP: ShopContext = Object.freeze({
  ...SHOP,
  shopId: "shop-b",
  shopIncarnationId: "e".repeat(32),
  registryRevision: 8,
  databaseFileId: "shop-b.db",
});

function cleanup(): void {
  for (const path of [
    identityAuthorityPath(),
    identityAuthorityMarkerPath(),
    identityAuthorityPath().replace(/\.json$/, ".lock"),
    memberAuthorityPath(),
    memberAuthorityMarkerPath(),
    memberAuthorityPath().replace(/\.json$/, ".lock"),
  ]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Focused assertions surface meaningful cleanup failures.
    }
  }
}

function configuredRoot(): Buffer {
  const value = process.env.SF_MASTER_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("SF_MASTER_KEY must be configured for member tests");
  }
  return Buffer.from(value, "hex");
}

beforeEach(async () => {
  cleanup();
  vi.useRealTimers();
  await bindOwnerIdentitySession("owner-session", SHOP);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("member invitation authority", () => {
  it("creates one expiring invitation and never exposes its stored digest", async () => {
    const created = await createMemberInvitation("owner-session", SHOP, {
      requestId: "11111111-1111-4111-8111-111111111111",
      role: "operator",
      permissions: ["shops.read"],
      shopIds: ["shop-a"],
    });

    expect(created).toMatchObject({
      replayed: false,
      revision: 2,
      invitation: {
        role: "operator",
        permissions: ["shops.read"],
        shopIds: ["shop-a"],
        state: "pending",
      },
    });
    expect(created.token).toMatch(
      /^sf-invite-v1\.[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/,
    );

    const listed = await listMemberInvitations("owner-session", SHOP);
    expect(listed.revision).toBe(2);
    expect(listed.invitations).toEqual([created.invitation]);
    expect(JSON.stringify(listed)).not.toContain(created.token!);
    expect(JSON.stringify(listed)).not.toContain("secretDigest");
  });

  it("replays the same request without revealing the token again", async () => {
    const input = {
      requestId: "22222222-2222-4222-8222-222222222222",
      role: "viewer" as const,
      shopIds: ["shop-a"],
    };
    const first = await createMemberInvitation("owner-session", SHOP, input);
    const replay = await createMemberInvitation("owner-session", SHOP, input);

    expect(replay).toMatchObject({
      replayed: true,
      token: null,
      revision: first.revision,
      invitation: { id: first.invitation.id },
    });
  });

  it("rejects an idempotency key reused with different invitation authority", async () => {
    const requestId = "33333333-3333-4333-8333-333333333333";
    await createMemberInvitation("owner-session", SHOP, {
      requestId,
      role: "viewer",
      shopIds: ["shop-a"],
    });

    await expect(
      createMemberInvitation("owner-session", SHOP, {
        requestId,
        role: "operator",
        shopIds: ["shop-a"],
      }),
    ).rejects.toMatchObject({
      code: "INVITATION_IDEMPOTENCY_CONFLICT",
      statusCode: 409,
    });
  });

  it("serializes concurrent duplicate creation into one token and one replay", async () => {
    const input = {
      requestId: "44444444-4444-4444-8444-444444444444",
      role: "manager" as const,
      shopIds: ["shop-a"],
    };
    const [left, right] = await Promise.all([
      createMemberInvitation("owner-session", SHOP, input),
      createMemberInvitation("owner-session", SHOP, input),
    ]);

    expect(left.invitation.id).toBe(right.invitation.id);
    expect([left.token, right.token].filter(Boolean)).toHaveLength(1);
    expect([left.replayed, right.replayed].sort()).toEqual([false, true]);
  });

  it("enforces the owner shop ceiling and role permission ceiling", async () => {
    await expect(
      createMemberInvitation("owner-session", SHOP, {
        requestId: "55555555-5555-4555-8555-555555555555",
        role: "operator",
        shopIds: ["shop-b"],
      }),
    ).rejects.toMatchObject({
      code: "INVITATION_SHOP_FORBIDDEN",
      statusCode: 403,
    });

    await expect(
      createMemberInvitation("owner-session", SHOP, {
        requestId: "66666666-6666-4666-8666-666666666666",
        role: "viewer",
        permissions: ["sessions.revoke"],
        shopIds: ["shop-a"],
      }),
    ).rejects.toMatchObject({
      code: "INVITATION_PERMISSION_INVALID",
      statusCode: 400,
    });
  });

  it("derives expiry without mutating authenticated invitation facts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T20:00:00.000Z"));
    await createMemberInvitation("owner-session", SHOP, {
      requestId: "77777777-7777-4777-8777-777777777777",
      role: "viewer",
      shopIds: ["shop-a"],
      expiresInHours: 1,
    });

    vi.setSystemTime(new Date("2026-07-31T21:00:00.000Z"));
    const listed = await listMemberInvitations("owner-session", SHOP);
    expect(listed.invitations[0]?.state).toBe("expired");
  });

  it("revokes a pending invitation idempotently", async () => {
    const created = await createMemberInvitation("owner-session", SHOP, {
      requestId: "88888888-8888-4888-8888-888888888888",
      role: "viewer",
      shopIds: ["shop-a"],
    });

    const revoked = await revokeMemberInvitation(
      "owner-session",
      created.invitation.id,
      SHOP,
    );
    const replay = await revokeMemberInvitation(
      "owner-session",
      created.invitation.id,
      SHOP,
    );

    expect(revoked).toMatchObject({
      state: "revoked",
      invitation: { state: "revoked" },
    });
    expect(replay).toMatchObject({
      state: "already-revoked",
      invitation: { state: "revoked" },
      revision: revoked.revision,
    });
  });

  it("fails closed when invitation authority is altered", async () => {
    await createMemberInvitation("owner-session", SHOP, {
      requestId: "99999999-9999-4999-8999-999999999999",
      role: "viewer",
      shopIds: ["shop-a"],
    });
    const envelope = JSON.parse(readFileSync(memberAuthorityPath(), "utf8")) as {
      payload: { invitations: Array<{ role: string }> };
    };
    envelope.payload.invitations[0]!.role = "manager";
    writeFileSync(memberAuthorityPath(), JSON.stringify(envelope));

    await expect(
      listMemberInvitations("owner-session", SHOP),
    ).rejects.toMatchObject({
      code: "MEMBER_AUTHORITY_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("rejects an owner session from another exact shop context", async () => {
    await expect(
      listMemberInvitations("owner-session", OTHER_SHOP),
    ).rejects.toMatchObject({
      code: "IDENTITY_SHOP_FORBIDDEN",
      statusCode: 403,
    });
  });

  it("re-authenticates invitation authority during root rotation", async () => {
    await createMemberInvitation("owner-session", SHOP, {
      requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      role: "viewer",
      shopIds: ["shop-a"],
    });
    const oldKey = configuredRoot();
    const newKey = Buffer.alloc(32, 0x7c);
    try {
      expect(rotateMemberAuthorityAuthentication(oldKey, newKey, true)).toEqual({
        state: "verified",
        authorityKeyState: "old",
        markerKeyState: "old",
      });
      expect(rotateMemberAuthorityAuthentication(oldKey, newKey)).toEqual({
        state: "reauthenticated",
        authorityKeyState: "old",
        markerKeyState: "old",
      });
      expect(rotateMemberAuthorityAuthentication(oldKey, newKey)).toEqual({
        state: "already-new",
        authorityKeyState: "new",
        markerKeyState: "new",
      });
      rotateMemberAuthorityAuthentication(newKey, oldKey);
      await expect(
        listMemberInvitations("owner-session", SHOP),
      ).resolves.toMatchObject({ revision: 2 });
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });
});
