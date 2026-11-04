import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbRaw } from "@/lib/db";
import {
  SHOP_TRANSACTION_MAX_WAIT_MS,
  shareRawClient,
  shopPrismaClientOptions,
  withSingleConnectionPool,
} from "@/lib/db-pool";

/**
 * F-0043: with several SQLite connections, overlapping interactive transactions made the whole
 * query engine stop for the 5-second busy timeout, again and again (see src/lib/db-pool.ts).
 * These tests pin the three parts of the fix: the URL helper, the behaviour of the application's
 * own client under overlapping transactions, and that db.ts really builds its clients with it.
 */

const TABLE = "S42PoolProbe";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("withSingleConnectionPool", () => {
  it("adds connection_limit=1 to a plain file URL", () => {
    expect(withSingleConnectionPool("file:/data/shops/a.db")).toBe(
      "file:/data/shops/a.db?connection_limit=1",
    );
  });

  it("keeps a Windows path exactly as given", () => {
    const url = withSingleConnectionPool("file:C:\\Users\\Me\\AppData\\Local\\SahelFlow\\a.db");
    expect(url.startsWith("file:C:\\Users\\Me\\AppData\\Local\\SahelFlow\\a.db?")).toBe(true);
    expect(url).toContain("connection_limit=1");
  });

  it("keeps parameters that are already in the URL", () => {
    const url = withSingleConnectionPool("file:/a.db?connection_limit=3&socket_timeout=9");
    const params = new URL(url.replace("file:", "file://")).searchParams;
    expect(params.get("connection_limit")).toBe("3");
    expect(params.get("socket_timeout")).toBe("9");
    expect(params.get("pool_timeout")).toBeNull();
  });

  it("leaves a URL that is not a file: URL alone", () => {
    expect(withSingleConnectionPool("postgresql://u@h/db")).toBe("postgresql://u@h/db");
  });

  it("always raises the transaction wait, with or without a URL", () => {
    expect(shopPrismaClientOptions().transactionOptions?.maxWait).toBe(
      SHOP_TRANSACTION_MAX_WAIT_MS,
    );
    expect(shopPrismaClientOptions().datasourceUrl).toBeUndefined();
    expect(shopPrismaClientOptions("file:/a.db").datasourceUrl).toContain("connection_limit=1");
  });
});

describe("the application's database client under overlapping transactions", () => {
  beforeAll(async () => {
    await dbRaw.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${TABLE}" (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)`,
    );
    await dbRaw.$executeRawUnsafe(`DELETE FROM "${TABLE}"`);
    await dbRaw.$executeRawUnsafe(`INSERT INTO "${TABLE}" (id, n) VALUES (1, 0)`);
  });

  afterAll(async () => {
    await dbRaw.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLE}"`);
  });

  it("finishes more overlapping read-then-write transactions than the engine has threads, without waiting for the busy timeout", async () => {
    // One engine worker thread per CPU: two more transactions than that used to freeze the engine.
    const count = availableParallelism() + 2;
    const started = Date.now();
    const results = await Promise.allSettled(
      Array.from({ length: count }, () =>
        dbRaw.$transaction(async (tx) => {
          await tx.$queryRawUnsafe(`SELECT n FROM "${TABLE}" WHERE id = 1`);
          await sleep(50);
          await tx.$executeRawUnsafe(`UPDATE "${TABLE}" SET n = n + 1 WHERE id = 1`);
        }),
      ),
    );
    const elapsedMs = Date.now() - started;

    const failures = results.flatMap((result) =>
      result.status === "rejected"
        ? [String((result.reason as { code?: string })?.code ?? result.reason)]
        : [],
    );
    expect(failures).toEqual([]);
    const rows = (await dbRaw.$queryRawUnsafe(
      `SELECT n FROM "${TABLE}" WHERE id = 1`,
    )) as Array<{ n: number | bigint }>;
    expect(Number(rows[0]?.n)).toBe(count);
    // The busy timeout is 5 s; serialised, this takes well under one second.
    expect(elapsedMs).toBeLessThan(3_000);
  }, 90_000);

  it("lets transactions queue for longer than Prisma's default 2 s start wait", async () => {
    // 4 transactions of 900 ms behind one connection: the last one starts after 2.7 s.
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        dbRaw.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`UPDATE "${TABLE}" SET n = n + 1 WHERE id = 1`);
          await sleep(900);
        }),
      ),
    );
    const failures = results.flatMap((result) =>
      result.status === "rejected"
        ? [String((result.reason as { code?: string })?.code ?? result.reason)]
        : [],
    );
    expect(failures).toEqual([]);
  }, 90_000);
});

describe("shareRawClient", () => {
  it("creates the client once and gives the same object to every later caller", () => {
    const holder: { prismaRaw?: object } = {};
    let created = 0;
    const create = () => {
      created += 1;
      return { copy: created };
    };

    const first = shareRawClient(holder, create);
    const second = shareRawClient(holder, create);

    expect(created).toBe(1);
    expect(second).toBe(first);
    expect(holder.prismaRaw).toBe(first);
  });

  it("uses a client that another copy of the module already stored", () => {
    const stored = { fromAnotherBundle: true };
    const holder: { prismaRaw?: object } = { prismaRaw: stored };
    let created = 0;

    const got = shareRawClient(holder, () => {
      created += 1;
      return {};
    });

    expect(got).toBe(stored);
    expect(created).toBe(0);
  });
});

describe("db.ts", () => {
  it("shares its raw client through globalThis in production too (two bundles = two copies of the module)", () => {
    const source = readFileSync(join(__dirname, "..", "db.ts"), "utf8");
    // Next.js compiles db.ts once for the workers (instrumentation) and once for the routes.
    expect(source).toMatch(/shareRawClient\(\s*globalForPrisma,/);
    // The old guard stored the client only outside production, so a packaged process had two clients.
    expect(source).not.toMatch(
      /NODE_ENV\s*!==\s*"production"\s*\)\s*\{\s*globalForPrisma\.prismaRaw\s*=/,
    );
  });

  it("builds every PrismaClient with the single-connection options", () => {
    const source = readFileSync(join(__dirname, "..", "db.ts"), "utf8");
    const constructions = source.match(/new PrismaClient\(/g)?.length ?? 0;
    const withOptions = source.match(/\.\.\.shopPrismaClientOptions\(/g)?.length ?? 0;
    expect(constructions).toBeGreaterThanOrEqual(2);
    expect(withOptions).toBe(constructions);
  });
});
