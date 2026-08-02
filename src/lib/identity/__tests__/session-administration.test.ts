import { existsSync, unlinkSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import type { ShopContext } from "@/lib/shops/context";
import {
  bindOwnerIdentitySession,
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  resolveDurableIdentityActor,
} from "../control-authority";
import {
  getIdentityAdministrationView,
  revokeAdministrativeSession,
} from "../session-administration";

const SHOP: ShopContext = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "default",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 7,
  databaseFileId: "default.db",
  migrationSetSha256: "4".repeat(64),
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
      // The test that follows will expose a meaningful cleanup failure.
    }
  }
}

async function seedSession(id: string, ip: string): Promise<void> {
  await rawDb.session.create({
    data: {
      id,
      ip,
      issuedAt: new Date("2026-07-31T18:00:00.000Z"),
      lastSeenAt: new Date("2026-07-31T18:05:00.000Z"),
    },
  });
  await bindOwnerIdentitySession(id, SHOP);
}

beforeEach(async () => {
  await rawDb.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS identity_test_block_session_revoke",
  );
  cleanupAuthority();
  await cleanDb();
});

afterAll(async () => {
  await rawDb.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS identity_test_block_session_revoke",
  );
  cleanupAuthority();
  await cleanDb();
  await rawDb.$disconnect();
});

describe("identity session administration", () => {
  it("merges control and database facts without exposing IP addresses", async () => {
    await seedSession("session-current", "10.0.0.1");
    await seedSession("session-target", "10.0.0.2");

    const view = await getIdentityAdministrationView(
      "session-current",
      SHOP,
    );
    expect(view.sessions).toHaveLength(2);
    expect(view.sessions.find((session) => session.current)).toMatchObject({
      sessionId: "session-current",
      databaseState: "active",
    });
    expect(view.sessions.find((session) => !session.current)).toMatchObject({
      sessionId: "session-target",
      databaseState: "active",
    });
    expect(JSON.stringify(view)).not.toContain("10.0.0.");
  });

  it("revokes another session in control, database, and audit evidence", async () => {
    await seedSession("session-current", "10.0.0.1");
    await seedSession("session-target", "10.0.0.2");

    const result = await revokeAdministrativeSession({
      currentSessionId: "session-current",
      targetSessionId: "session-target",
      shop: SHOP,
      auditActor: `person:${"5".repeat(32)}`,
    });

    expect(result).toMatchObject({
      state: "revoked",
      sessionId: "session-target",
      databaseState: "revoked",
    });
    expect(
      (await rawDb.session.findUniqueOrThrow({
        where: { id: "session-target" },
      })).revokedAt,
    ).not.toBeNull();
    await expect(
      resolveDurableIdentityActor("session-target", SHOP),
    ).rejects.toMatchObject({
      code: "IDENTITY_SESSION_BINDING_REQUIRED",
      statusCode: 401,
    });
    const audit = await rawDb.auditLog.findFirstOrThrow({
      where: {
        action: "auth.session.revoked",
        entityId: "session-target",
      },
    });
    expect(audit.actor).toBe(`person:${"5".repeat(32)}`);
    expect(JSON.parse(audit.after ?? "{}")).toMatchObject({
      databaseState: "revoked",
    });
  });

  it("replays an already-revoked session without restoring authority", async () => {
    await seedSession("session-current", "10.0.0.1");
    await seedSession("session-target", "10.0.0.2");

    const first = await revokeAdministrativeSession({
      currentSessionId: "session-current",
      targetSessionId: "session-target",
      shop: SHOP,
      auditActor: "person:owner",
    });
    const replay = await revokeAdministrativeSession({
      currentSessionId: "session-current",
      targetSessionId: "session-target",
      shop: SHOP,
      auditActor: "person:owner",
    });

    expect(first.state).toBe("revoked");
    expect(replay).toMatchObject({
      state: "already-revoked",
      databaseState: "already-revoked",
      revokedAt: first.revokedAt,
      authorityRevision: first.authorityRevision,
    });
  });

  it("keeps control denial when database evidence fails and completes on retry", async () => {
    await seedSession("session-current", "10.0.0.1");
    await seedSession("session-target", "10.0.0.2");
    await rawDb.$executeRawUnsafe(`
      CREATE TRIGGER identity_test_block_session_revoke
      BEFORE UPDATE OF revokedAt ON Session
      BEGIN
        SELECT RAISE(ABORT, 'database unavailable');
      END
    `);

    await expect(
      revokeAdministrativeSession({
        currentSessionId: "session-current",
        targetSessionId: "session-target",
        shop: SHOP,
        auditActor: "person:owner",
      }),
    ).rejects.toMatchObject({
      code: "SESSION_REVOCATION_PERSISTENCE_FAILED",
      statusCode: 503,
    });
    await expect(
      resolveDurableIdentityActor("session-target", SHOP),
    ).rejects.toMatchObject({
      code: "IDENTITY_SESSION_BINDING_REQUIRED",
      statusCode: 401,
    });
    expect(
      (await rawDb.session.findUniqueOrThrow({
        where: { id: "session-target" },
      })).revokedAt,
    ).toBeNull();
    expect(
      await rawDb.auditLog.count({
        where: { action: "auth.session.revoked" },
      }),
    ).toBe(0);

    await rawDb.$executeRawUnsafe(
      "DROP TRIGGER identity_test_block_session_revoke",
    );
    await expect(
      revokeAdministrativeSession({
        currentSessionId: "session-current",
        targetSessionId: "session-target",
        shop: SHOP,
        auditActor: "person:owner",
      }),
    ).resolves.toMatchObject({
      state: "already-revoked",
      databaseState: "revoked",
    });
    expect(
      (await rawDb.session.findUniqueOrThrow({
        where: { id: "session-target" },
      })).revokedAt,
    ).not.toBeNull();
    expect(
      await rawDb.auditLog.count({
        where: { action: "auth.session.revoked" },
      }),
    ).toBe(1);
  });

  it("never routes current-session revocation into the database", async () => {
    await seedSession("session-current", "10.0.0.1");

    await expect(
      revokeAdministrativeSession({
        currentSessionId: "session-current",
        targetSessionId: "session-current",
        shop: SHOP,
        auditActor: "person:owner",
      }),
    ).rejects.toMatchObject({
      code: "CURRENT_SESSION_REVOCATION_REQUIRES_LOGOUT",
      statusCode: 409,
    });
    expect(
      (await rawDb.session.findUniqueOrThrow({
        where: { id: "session-current" },
      })).revokedAt,
    ).toBeNull();
  });
});
