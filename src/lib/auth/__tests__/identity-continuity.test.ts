import { existsSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { dbRaw } from "@/lib/db";
import {
  identityAuthorityMarkerPath,
  identityAuthorityPath,
} from "@/lib/identity/control-authority";
import { AUTH_COOKIE } from "../config";
import { createSession, setupAuth } from "../server";

const FOOTPRINT_KEY = "identity_authority_initialized_v1";

function deleteControlFiles(): void {
  for (const path of [identityAuthorityPath(), identityAuthorityMarkerPath()]) {
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Assertions below surface any meaningful failure.
    }
  }
}

async function clean(): Promise<void> {
  cookieJar.reset();
  deleteControlFiles();
  await dbRaw.$transaction([
    dbRaw.auditLog.deleteMany(),
    dbRaw.session.deleteMany(),
    dbRaw.authSecret.deleteMany(),
    dbRaw.setting.deleteMany(),
  ]);
}

beforeEach(clean);
afterEach(clean);

describe("durable identity initialization continuity", () => {
  it("persists a workspace/installation footprint after the first login", async () => {
    await setupAuth("12345678");
    await createSession("127.0.0.1");

    const footprint = await dbRaw.setting.findUnique({
      where: { key: FOOTPRINT_KEY },
    });
    expect(footprint).not.toBeNull();
    expect(JSON.parse(footprint!.value)).toEqual({
      formatVersion: 1,
      workspaceId: "0".repeat(32),
      installationId: "0".repeat(32),
    });
    expect(existsSync(identityAuthorityPath())).toBe(true);
    expect(existsSync(identityAuthorityMarkerPath())).toBe(true);
    expect(cookieJar.map.has(AUTH_COOKIE)).toBe(true);
  });

  it("blocks replacement-owner creation when both control files disappear", async () => {
    await setupAuth("12345678");
    await createSession("127.0.0.1");
    const originalActiveSession = await dbRaw.session.findFirstOrThrow({
      where: { revokedAt: null },
    });

    deleteControlFiles();
    cookieJar.reset();
    cookieJar.set.mockClear();

    await expect(createSession("127.0.0.2")).rejects.toMatchObject({
      code: "IDENTITY_AUTHORITY_MISSING",
      statusCode: 503,
    });
    expect(cookieJar.set).not.toHaveBeenCalled();
    expect(cookieJar.map.has(AUTH_COOKIE)).toBe(false);

    const sessions = await dbRaw.session.findMany({
      orderBy: { createdAt: "asc" },
    });
    expect(sessions).toHaveLength(2);
    expect(
      sessions.find((session) => session.id === originalActiveSession.id)?.revokedAt,
    ).toBeNull();
    expect(
      sessions.find((session) => session.id !== originalActiveSession.id)?.revokedAt,
    ).not.toBeNull();
  });

  it("fails closed when the database footprint belongs to another installation", async () => {
    await setupAuth("12345678");
    await dbRaw.setting.create({
      data: {
        key: FOOTPRINT_KEY,
        value: JSON.stringify({
          formatVersion: 1,
          workspaceId: "f".repeat(32),
          installationId: "e".repeat(32),
        }),
      },
    });

    await expect(createSession("127.0.0.1")).rejects.toMatchObject({
      code: "IDENTITY_AUTHORITY_FOOTPRINT_MISMATCH",
      statusCode: 409,
    });
    expect(await dbRaw.session.count({ where: { revokedAt: null } })).toBe(0);
    expect(cookieJar.set).not.toHaveBeenCalled();
  });
});
