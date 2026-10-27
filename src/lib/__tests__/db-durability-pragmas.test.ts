import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import { dbRaw, disconnectAllShops, getShopClient } from "@/lib/db";

/**
 * PB-DATA-DURABILITY: Algeria has power cuts, so an order or cash write that was acknowledged to
 * the seller must survive one. `src/lib/db.ts` sets no pragma itself, so the values below are
 * whatever Prisma's SQLite engine and the SQLite library give every connection. This file reads
 * them back through the application's own clients (the bound `dbRaw` and the `getShopClient`
 * factory) and pins them, so a Prisma upgrade or a changed URL that weakens them fails here.
 *
 * Pinned (Founder decision): synchronous FULL (2), foreign_keys ON, busy_timeout >= 5000 ms.
 * journal_mode is only read: it must be one value on every connection and a known mode. In WAL
 * mode anything below FULL would lose the last commits on power loss, hence the FULL check.
 */

interface Readable {
  $queryRawUnsafe: (query: string) => Promise<unknown>;
  $executeRawUnsafe: (query: string) => Promise<unknown>;
}

interface Pragmas {
  journalMode: string;
  synchronous: number;
  foreignKeys: number;
  busyTimeout: number;
}

async function scalar(client: Readable, pragma: string): Promise<unknown> {
  const rows = (await client.$queryRawUnsafe(`PRAGMA ${pragma}`)) as Record<
    string,
    unknown
  >[];
  expect(rows).toHaveLength(1);
  return Object.values(rows[0]!)[0];
}

async function readPragmas(client: Readable): Promise<Pragmas> {
  return {
    journalMode: String(await scalar(client, "journal_mode")).toLowerCase(),
    synchronous: Number(await scalar(client, "synchronous")),
    foreignKeys: Number(await scalar(client, "foreign_keys")),
    busyTimeout: Number(await scalar(client, "busy_timeout")),
  };
}

// About 20 ms of work, so parallel calls overlap and the pool has to open several connections.
const SLOW = `(WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 300000)
  SELECT count(*) AS n FROM c)`;

/** All four values read by ONE statement, so they all come from the same connection, and the
 *  statement is slow enough that eight of them run at the same time. */
async function readInOneStatement(client: Readable): Promise<Pragmas> {
  const rows = (await client.$queryRawUnsafe(
    `SELECT j.journal_mode AS journalMode, s.synchronous AS synchronous,
            f.foreign_keys AS foreignKeys, b.timeout AS busyTimeout, slow.n AS n
       FROM pragma_journal_mode j, pragma_synchronous s, pragma_foreign_keys f,
            pragma_busy_timeout b, ${SLOW} slow`,
  )) as Record<string, unknown>[];
  expect(rows).toHaveLength(1);
  return {
    journalMode: String(rows[0]!.journalMode).toLowerCase(),
    synchronous: Number(rows[0]!.synchronous),
    foreignKeys: Number(rows[0]!.foreignKeys),
    busyTimeout: Number(rows[0]!.busyTimeout),
  };
}

/** Eight parallel reads of each form (the literal PRAGMA statements, and one overlapping
 *  statement), so one odd connection in the pool would show. */
async function readOnManyConnections(client: Readable): Promise<Pragmas[]> {
  const literal = await Promise.all(
    Array.from({ length: 8 }, () => readPragmas(client)),
  );
  const overlapping = await Promise.all(
    Array.from({ length: 8 }, () => readInOneStatement(client)),
  );
  return [...literal, ...overlapping];
}

function expectDurable(all: Pragmas[]): void {
  expect(all).toHaveLength(16);
  const distinct = (pick: (p: Pragmas) => unknown) =>
    [...new Set(all.map(pick))];
  // One value on every connection.
  expect(distinct((p) => p.journalMode)).toHaveLength(1);
  expect(distinct((p) => p.synchronous)).toEqual([2]);
  expect(distinct((p) => p.foreignKeys)).toEqual([1]);
  const timeouts = distinct((p) => p.busyTimeout) as number[];
  expect(Math.min(...timeouts)).toBeGreaterThanOrEqual(5000);
  expect(["delete", "wal"]).toContain(all[0]!.journalMode);
}

const scratch: string[] = [];

afterAll(async () => {
  await disconnectAllShops();
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe("application database durability pragmas (PB-DATA-DURABILITY)", () => {
  it("the bound application database gives every connection FULL sync, foreign keys and a 5 s busy timeout", async () => {
    const all = await readOnManyConnections(dbRaw as unknown as Readable);
    expectDurable(all);
  });

  it("a shop database opened through getShopClient gives every connection the same guarantees", async () => {
    const bound = resolve(
      (process.env.DATABASE_URL ?? "").replace(/^file:/, ""),
    );
    const root = existsSync(dirname(bound)) ? dirname(bound) : tmpdir();
    mkdirSync(root, { recursive: true });
    const dir = mkdtempSync(join(root, "durability-"));
    scratch.push(dir);
    const shop = getShopClient(join(dir, "shop.db")) as unknown as Readable;

    const all = await readOnManyConnections(shop);
    expectDurable(all);
  });

  it("overlapping statements really run on more than one connection", async () => {
    // A temp table is private to one connection. CREATE TEMP TABLE succeeds once per
    // connection and fails on a reused one, so the number of successes is the number of
    // different connections that served eight overlapping calls.
    const dir = mkdtempSync(join(tmpdir(), "durability-probe-"));
    scratch.push(dir);
    const shop = getShopClient(join(dir, "probe.db")) as unknown as Readable;
    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, async () => {
        await shop.$queryRawUnsafe(`SELECT ${SLOW}`);
        await shop.$executeRawUnsafe("CREATE TEMP TABLE sf_probe (x INTEGER)");
      }),
    );
    const connections = outcomes.filter((o) => o.status === "fulfilled").length;
    expect(connections).toBeGreaterThan(1);
  });

  it("the reader can see a weakened connection (self-check of this guard)", async () => {
    // One connection only, so the weakened setting cannot hide on a connection the reads skip.
    const dir = mkdtempSync(join(tmpdir(), "durability-weak-"));
    scratch.push(dir);
    const weak = new PrismaClient({
      datasourceUrl: `file:${join(dir, "weak.db")}?connection_limit=1`,
    });
    try {
      await weak.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
      const values = await readPragmas(weak as unknown as Readable);
      expect(values.synchronous).toBe(1);
    } finally {
      await weak.$disconnect();
    }
  });
});

// The child writes one row per statement and prints "ACK n" only after the write returned.
// It uses the generated Prisma client with the same SQLite engine and URL form as src/lib/db.ts,
// which sets no pragma of its own, so the connection settings are the ones read above.
const WRITER = `
const { PrismaClient } = require("@prisma/client");
(async () => {
  const db = new PrismaClient({ datasourceUrl: "file:" + process.argv[1] });
  await db.$executeRawUnsafe("CREATE TABLE t (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)");
  for (let n = 1; n <= 5000; n++) {
    await db.$executeRawUnsafe("INSERT INTO t (id, payload) VALUES (" + n + ", 'row-' || " + n + ")");
    process.stdout.write("ACK " + n + "\\n");
  }
})();
`;

describe("a write acknowledged before the process is killed (PB-DATA-DURABILITY)", () => {
  it("is still in the database after SIGKILL, and the file is intact", async () => {
    // SIGKILL is a process crash, not a power cut: the operating system keeps its cache. It
    // proves nothing was held back inside the process; the fsync side is the synchronous=2 above.
    const dir = mkdtempSync(join(tmpdir(), "durability-kill-"));
    scratch.push(dir);
    const file = join(dir, "kill.db");
    const child = spawn(process.execPath, ["-e", WRITER, file], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "inherit"],
    });
    let acked = 0;
    const exited = new Promise<void>((done, fail) => {
      child.on("error", fail);
      child.on("exit", () => done());
    });
    let pending = "";
    child.stdout.on("data", (chunk: Buffer) => {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const match = /^ACK (\d+)$/.exec(line);
        if (match) acked = Number(match[1]);
      }
      if (acked >= 25) child.kill("SIGKILL");
    });
    await exited;
    expect(acked).toBeGreaterThanOrEqual(25);

    const reopened = new PrismaClient({ datasourceUrl: `file:${file}` });
    try {
      const [first] = (await reopened.$queryRawUnsafe(
        "SELECT count(*) AS n, max(id) AS top FROM t",
      )) as { n: number | bigint; top: number | bigint }[];
      const { n, top } = first!;
      const integrity = (await reopened.$queryRawUnsafe(
        "PRAGMA integrity_check",
      )) as { integrity_check: string }[];
      // Every acknowledged row is there; a later row may be too (committed, ack not yet read).
      expect(Number(n)).toBeGreaterThanOrEqual(acked);
      // No gap: a half-applied transaction or a lost middle row would break this.
      expect(Number(top)).toBe(Number(n));
      expect(integrity).toEqual([{ integrity_check: "ok" }]);
    } finally {
      await reopened.$disconnect();
    }
  });
});
