import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ShopContext } from "@/lib/shops/context";
import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  resolveDurableIdentityActor,
  rotateIdentityAuthorityAuthentication,
} from "../control-authority";

const SHOP_A: ShopContext = Object.freeze({
  workspaceId: "a".repeat(32),
  installationId: "b".repeat(32),
  shopId: "shop-a",
  shopIncarnationId: "c".repeat(32),
  registryRevision: 7,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "d".repeat(64),
});

const SHOP_B: ShopContext = Object.freeze({
  ...SHOP_A,
  shopId: "shop-b",
  shopIncarnationId: "e".repeat(32),
  registryRevision: 8,
  databaseFileId: "shop-b.db",
});

function cleanupAuthority(): void {
  for (const path of [
    identityAuthorityPath(),
    identityAuthorityMarkerPath(),
    `${identityAuthorityPath().replace(/\.json$/, "")}.lock`,
  ]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // The assertion that follows will surface any meaningful cleanup failure.
    }
  }
}

function configuredRoot(): Buffer {
  const value = process.env.SF_MASTER_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("SF_MASTER_KEY must be configured for identity tests");
  }
  return Buffer.from(value, "hex");
}

beforeEach(cleanupAuthority);
afterEach(cleanupAuthority);

describe("installation identity authority", () => {
  it("persists stable person, member, and device identities across sessions", async () => {
    const first = await bindOwnerIdentitySession("session-1", SHOP_A);
    const replay = await resolveDurableIdentityActor("session-1", SHOP_A);
    const second = await bindOwnerIdentitySession("session-2", SHOP_A);

    expect(replay).toEqual(first);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      role: "owner",
      policyVersion: 1,
      revocationEpoch: 0,
    });
    expect(first.personId).toMatch(/^[0-9a-f]{32}$/);
    expect(first.workspaceMemberId).toMatch(/^[0-9a-f]{32}$/);
    expect(first.deviceId).toMatch(/^[0-9a-f]{32}$/);
    expect(existsSync(identityAuthorityPath())).toBe(true);
    expect(existsSync(identityAuthorityMarkerPath())).toBe(true);
  });

  it("serializes concurrent first-use bindings into one durable owner", async () => {
    const [first, second, third] = await Promise.all([
      bindOwnerIdentitySession("session-1", SHOP_A),
      bindOwnerIdentitySession("session-2", SHOP_A),
      bindOwnerIdentitySession("session-3", SHOP_A),
    ]);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    await expect(resolveDurableIdentityActor("session-1", SHOP_A)).resolves.toEqual(
      first,
    );
    await expect(resolveDurableIdentityActor("session-2", SHOP_A)).resolves.toEqual(
      first,
    );
    await expect(resolveDurableIdentityActor("session-3", SHOP_A)).resolves.toEqual(
      first,
    );
  });

  it("revokes selected durable session bindings during rotation", async () => {
    await bindOwnerIdentitySession("session-old", SHOP_A);
    const current = await bindOwnerIdentitySession("session-current", SHOP_A, {
      revokeSessionIds: ["session-old"],
    });

    await expect(
      resolveDurableIdentityActor("session-old", SHOP_A),
    ).rejects.toMatchObject({
      code: "IDENTITY_SESSION_BINDING_REQUIRED",
      statusCode: 401,
    });
    await expect(
      resolveDurableIdentityActor("session-current", SHOP_A),
    ).resolves.toEqual(current);
  });

  it("denies a session in a shop that is not in the member grant", async () => {
    await bindOwnerIdentitySession("session-1", SHOP_A);

    await expect(
      resolveDurableIdentityActor("session-1", SHOP_B),
    ).rejects.toMatchObject({
      code: "IDENTITY_SHOP_FORBIDDEN",
      statusCode: 403,
    });
  });

  it("fails closed when the authenticated authority payload is altered", async () => {
    await bindOwnerIdentitySession("session-1", SHOP_A);
    const envelope = JSON.parse(
      readFileSync(identityAuthorityPath(), "utf8"),
    ) as {
      payload: { workspace: { policyVersion: number } };
    };
    envelope.payload.workspace.policyVersion += 1;
    writeFileSync(identityAuthorityPath(), JSON.stringify(envelope));

    await expect(
      resolveDurableIdentityActor("session-1", SHOP_A),
    ).rejects.toMatchObject({
      code: "IDENTITY_AUTHORITY_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("treats a retained initialization marker with a missing authority as fatal", async () => {
    await bindOwnerIdentitySession("session-1", SHOP_A);
    unlinkSync(identityAuthorityPath());

    await expect(
      resolveDurableIdentityActor("session-1", SHOP_A),
    ).rejects.toMatchObject({
      code: "IDENTITY_AUTHORITY_MISSING",
      statusCode: 503,
    });
  });

  it("re-authenticates under the candidate root and resumes idempotently", async () => {
    await bindOwnerIdentitySession("session-1", SHOP_A);
    const oldKey = configuredRoot();
    const newKey = Buffer.alloc(32, 0x5a);
    try {
      expect(
        rotateIdentityAuthorityAuthentication(oldKey, newKey, true),
      ).toEqual({
        state: "verified",
        authorityKeyState: "old",
        markerKeyState: "old",
      });
      expect(rotateIdentityAuthorityAuthentication(oldKey, newKey)).toEqual({
        state: "reauthenticated",
        authorityKeyState: "old",
        markerKeyState: "old",
      });
      expect(rotateIdentityAuthorityAuthentication(oldKey, newKey)).toEqual({
        state: "already-new",
        authorityKeyState: "new",
        markerKeyState: "new",
      });

      // Reverse the test rotation so normal root-backed reads remain valid.
      expect(rotateIdentityAuthorityAuthentication(newKey, oldKey)).toEqual({
        state: "reauthenticated",
        authorityKeyState: "old",
        markerKeyState: "old",
      });
      await expect(
        resolveDurableIdentityActor("session-1", SHOP_A),
      ).resolves.toMatchObject({ role: "owner" });
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });

  it("repairs a missing marker while rotating an authenticated authority", async () => {
    await bindOwnerIdentitySession("session-1", SHOP_A);
    unlinkSync(identityAuthorityMarkerPath());
    const oldKey = configuredRoot();
    const newKey = Buffer.alloc(32, 0x6b);
    try {
      expect(rotateIdentityAuthorityAuthentication(oldKey, newKey)).toEqual({
        state: "reauthenticated",
        authorityKeyState: "old",
        markerKeyState: "missing",
      });
      expect(existsSync(identityAuthorityMarkerPath())).toBe(true);
      rotateIdentityAuthorityAuthentication(newKey, oldKey);
    } finally {
      oldKey.fill(0);
      newKey.fill(0);
    }
  });
});
