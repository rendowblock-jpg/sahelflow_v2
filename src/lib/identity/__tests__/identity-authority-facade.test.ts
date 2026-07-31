import { existsSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  rotateIdentityAuthorityAuthentication,
} from "@/lib/identity/control-authority";
import type { ShopContext } from "@/lib/shops/context";
import {
  createMemberInvitation,
  listMemberInvitations,
  memberAuthorityMarkerPath,
  memberAuthorityPath,
} from "../member-authority";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
});

function rootKey(): Buffer {
  const value = process.env.SF_MASTER_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("SF_MASTER_KEY must be configured for identity tests");
  }
  return Buffer.from(value, "hex");
}

function cleanup(): void {
  for (const path of [
    identityAuthorityPath(),
    identityAuthorityMarkerPath(),
    memberAuthorityPath(),
    memberAuthorityMarkerPath(),
  ]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Focused assertions expose meaningful cleanup failures.
    }
  }
}

beforeEach(cleanup);
afterEach(cleanup);

describe("public installation identity authority", () => {
  it("re-authenticates core and member files under one resumable root rotation", async () => {
    await bindOwnerIdentitySession("session-owner", SHOP);
    await createMemberInvitation("session-owner", SHOP, {
      requestId: "11111111-1111-4111-8111-111111111111",
      role: "operator",
      permissions: null,
      shopIds: [SHOP.shopId],
      expiresInHours: 24,
    });

    const oldKey = rootKey();
    const newKey = Buffer.alloc(32, 0x71);
    try {
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey, true),
      ).toMatchObject({ state: "verified" });
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey),
      ).toMatchObject({ state: "reauthenticated" });
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey),
      ).toMatchObject({ state: "already-new" });

      // Restore the test environment's configured key and prove both stores read.
      expect(
        rotateIdentityAuthorityAuthentication(newKey, oldKey),
      ).toMatchObject({ state: "reauthenticated" });
      await expect(
        listMemberInvitations("session-owner", SHOP),
      ).resolves.toMatchObject({
        invitations: [{ role: "operator", state: "pending" }],
      });
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });

  it("rejects a member authority orphan before rewriting it", async () => {
    await bindOwnerIdentitySession("session-owner", SHOP);
    await createMemberInvitation("session-owner", SHOP, {
      requestId: "22222222-2222-4222-8222-222222222222",
      role: "viewer",
      permissions: null,
      shopIds: [SHOP.shopId],
      expiresInHours: 24,
    });
    unlinkSync(identityAuthorityPath());
    unlinkSync(identityAuthorityMarkerPath());

    const oldKey = rootKey();
    const newKey = Buffer.alloc(32, 0x72);
    try {
      expect(() => rotateIdentityAuthorityAuthentication(oldKey, newKey)).toThrow(
        expect.objectContaining({
          code: "MEMBER_AUTHORITY_ORPHANED",
          statusCode: 503,
        }),
      );
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });
});
