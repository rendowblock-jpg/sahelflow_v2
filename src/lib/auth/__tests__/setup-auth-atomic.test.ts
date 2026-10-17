import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IDN-08: first-run setup must be a single winner. `setupAuth` used to
 * `upsert`, so two overlapping submissions both "succeeded" and the later write
 * replaced the earlier one's signing secret and PIN. The fake below models the
 * one database property that matters: `create` on an existing primary key
 * fails with Prisma's P2002, atomically.
 *
 * (A real-SQLite version of the same race lives in server.test.ts and runs in
 * CI, where a database exists.)
 */
const store = vi.hoisted(() => {
  type Row = { id: string; secret: string; pinHash: string };
  const rows = new Map<string, Row>();
  const state = { createError: null as Error | null };

  function uniqueViolation(): Error {
    return Object.assign(new Error("Unique constraint failed on the fields: (`id`)"), {
      code: "P2002",
    });
  }

  const authSecret = {
    async findUnique({ where }: { where: { id: string } }) {
      await Promise.resolve();
      return rows.get(where.id) ?? null;
    },
    async create({ data }: { data: Row }) {
      await Promise.resolve();
      if (state.createError) throw state.createError;
      if (rows.has(data.id)) throw uniqueViolation();
      rows.set(data.id, { ...data });
      return { ...data };
    },
    async upsert({
      where,
      create,
      update,
    }: {
      where: { id: string };
      create: Row;
      update: Partial<Row>;
    }) {
      await Promise.resolve();
      const current = rows.get(where.id);
      if (current) Object.assign(current, update);
      else rows.set(where.id, { ...create });
      return rows.get(where.id);
    },
    async updateMany({
      where,
      data,
    }: {
      where: { id: string; pinHash?: string };
      data: Partial<Row>;
    }) {
      await Promise.resolve();
      const current = rows.get(where.id);
      if (current && (where.pinHash === undefined || current.pinHash === where.pinHash)) {
        Object.assign(current, data);
        return { count: 1 };
      }
      return { count: 0 };
    },
  };
  return { rows, state, authSecret };
});

vi.mock("@/lib/db", () => ({
  db: { authSecret: store.authSecret, setting: {} },
  dbRaw: {},
  shopContext: { shopId: "default" },
}));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/crypto/auth-secret-seal", () => ({
  sealAuthSecretValue: async (_client: unknown, _field: string, value: string) =>
    `sealed:${value}`,
  openAuthSecretValue: async (_client: unknown, _field: string, value: string) =>
    value.replace(/^sealed:/, ""),
}));
vi.mock("@/lib/identity/control-authority", () => ({}));
vi.mock("@/lib/identity/session-authority", () => ({}));
vi.mock("@/lib/shops/authority", () => ({}));
vi.mock("@/lib/auth/reauthentication-authority", () => ({}));

import { setupAuth } from "@/lib/auth/server";

beforeEach(() => {
  store.rows.clear();
  store.state.createError = null;
});

describe("setupAuth is a single-winner create (IDN-08)", () => {
  it("lets exactly one of two overlapping first-run submissions create the owner", async () => {
    const results = await Promise.allSettled([
      setupAuth("11111111"),
      setupAuth("22222222"),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<{ secret: string }> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: "AUTH_ALREADY_SETUP",
      statusCode: 409,
    });
    expect(store.rows.size).toBe(1);
    expect(store.rows.get("default")?.secret).toBe(fulfilled[0]?.value.secret);
  });

  it("refuses a later setup and leaves the first owner's authority untouched", async () => {
    const first = await setupAuth("11111111");
    const before = { ...store.rows.get("default") };

    await expect(setupAuth("22222222")).rejects.toMatchObject({
      code: "AUTH_ALREADY_SETUP",
    });

    expect(store.rows.get("default")).toEqual(before);
    expect(store.rows.get("default")?.secret).toBe(first.secret);
  });

  it("still repairs a half-written row that has no PIN hash", async () => {
    store.rows.set("default", { id: "default", secret: "stale", pinHash: "" });

    const { secret } = await setupAuth("11111111");

    expect(store.rows.get("default")).toMatchObject({ secret });
    expect(store.rows.get("default")?.pinHash).toMatch(/^sealed:/);
  });

  it("does not disguise other database failures as 'already set up'", async () => {
    store.state.createError = new Error("disk full");

    await expect(setupAuth("11111111")).rejects.toThrow("disk full");
    expect(store.rows.size).toBe(0);
  });
});
