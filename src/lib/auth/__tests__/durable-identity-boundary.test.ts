import { existsSync, unlinkSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn((key: string) =>
      map.has(key) ? { value: map.get(key) } : undefined,
    ),
    set: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    delete: vi.fn((key: string) => {
      map.delete(key);
    }),
    reset: () => map.clear(),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookieJar.get,
    set: cookieJar.set,
    delete: cookieJar.delete,
  })),
}));

delete process.env.AUTH_SECRET;
delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;

import { dbRaw, shopContext } from "@/lib/db";
import {
  identityAuthorityMarkerPath,
  identityAuthorityPath,
  revokeIdentitySessionBinding,
} from "@/lib/identity/control-authority";
import {
  createSession,
  isAuthenticated,
  requireAuth,
  setupAuth,
} from "../server";

function cleanupAuthority(): void {
  for (const path of [
    identityAuthorityPath(),
    identityAuthorityMarkerPath(),
    `${identityAuthorityPath().replace(/\.json$/, "")}.lock`,
  ]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // The following assertion will expose a meaningful cleanup failure.
    }
  }
}

async function cleanAuthDb(): Promise<void> {
  await dbRaw.$transaction([
    dbRaw.auditLog.deleteMany(),
    dbRaw.session.deleteMany(),
    dbRaw.authSecret.deleteMany(),
    dbRaw.setting.deleteMany(),
  ]);
}

beforeEach(async () => {
  delete process.env.AUTH_SECRET;
  delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;
  cookieJar.reset();
  cleanupAuthority();
  await cleanAuthDb();
});

afterAll(async () => {
  cleanupAuthority();
  await cleanAuthDb();
  await dbRaw.$disconnect();
});

describe("durable identity authentication boundary", () => {
  it("allows a database session only while its durable binding remains active", async () => {
    await setupAuth("12345678");
    await createSession("10.0.0.1");
    await expect(requireAuth()).resolves.toBeUndefined();
    await expect(isAuthenticated()).resolves.toBe(true);
  });

  it("denies a still-active database session immediately after control revocation", async () => {
    await setupAuth("12345678");
    await createSession("10.0.0.1");
    const first = await dbRaw.session.findFirstOrThrow({
      orderBy: { createdAt: "asc" },
    });

    await createSession("10.0.0.2");
    const sessions = await dbRaw.session.findMany({
      orderBy: { createdAt: "asc" },
    });
    const current = sessions.at(-1)!;
    expect(current.id).not.toBe(first.id);

    await revokeIdentitySessionBinding(first.id, current.id, shopContext);
    expect(
      (await dbRaw.session.findUniqueOrThrow({ where: { id: current.id } }))
        .revokedAt,
    ).toBeNull();

    await expect(requireAuth()).rejects.toMatchObject({
      code: "IDENTITY_SESSION_BINDING_REQUIRED",
      statusCode: 401,
    });
    await expect(isAuthenticated()).resolves.toBe(false);
  });
});
