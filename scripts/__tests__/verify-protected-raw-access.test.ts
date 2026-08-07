import { describe, expect, it } from "vitest";

import { rawClientImports } from "../verify-protected-raw-access";

function kinds(source: string): string[] {
  return rawClientImports(source).map((finding) => finding.kind);
}

describe("protected raw-client authority parser", () => {
  it("allows ordinary canonical db imports", () => {
    expect(kinds('import { db } from "@/lib/db";')).toEqual([]);
    expect(kinds('const { db } = await import("@/lib/db");')).toEqual([]);
    expect(kinds('const db = (await import("@/lib/db")).db;')).toEqual([]);
  });

  it("allows canonical Promise.all destructuring", () => {
    expect(
      kinds(`
        const [{ db, shopContext }, { run }] = await Promise.all([
          import("@/lib/db"),
          import("./worker"),
        ]);
      `),
    ).toEqual([]);
  });

  it("detects named and aliased dbRaw imports", () => {
    expect(kinds('import { dbRaw } from "@/lib/db";')).toEqual(["named"]);
    expect(kinds('import { dbRaw as maintenanceDb } from "../lib/db";')).toEqual([
      "named",
    ]);
  });

  it("detects namespace and explicit dynamic raw access", () => {
    expect(kinds('import * as database from "@/lib/db";')).toEqual([
      "namespace",
    ]);
    expect(kinds('const { dbRaw } = await import("@/lib/db");')).toEqual([
      "dynamic",
    ]);
    expect(kinds('const raw = (await import("@/lib/db")).dbRaw;')).toEqual([
      "dynamic",
    ]);
  });

  it("fails closed for ambiguous dynamic, require and import-equals access", () => {
    expect(kinds('const database = await import("@/lib/db");')).toEqual([
      "dynamic",
    ]);
    expect(kinds('const database = require("@/lib/db");')).toEqual(["require"]);
    expect(kinds('const { db } = require("@/lib/db");')).toEqual([]);
    expect(kinds('import database = require("@/lib/db");')).toEqual([
      "import-equals",
    ]);
  });

  it("detects raw re-exports while ignoring comments and strings", () => {
    expect(kinds('export { dbRaw } from "@/lib/db";')).toEqual(["re-export"]);
    expect(
      kinds(`
        // const { dbRaw } = await import("@/lib/db");
        const example = 'import * as db from "@/lib/db"';
      `),
    ).toEqual([]);
  });

  it("blocks raw Prisma methods on canonical db imports and aliases", () => {
    expect(
      kinds(`
        import { db } from "@/lib/db";
        await db.$queryRaw\`SELECT 1\`;
        await db.$executeRawUnsafe("DELETE FROM Customer");
      `),
    ).toEqual(["canonical-raw-method", "canonical-raw-method"]);

    expect(
      kinds(`
        import { db as protectedDb } from "@/lib/db";
        const alias = protectedDb;
        await alias["$queryRawUnsafe"]("SELECT 1");
      `),
    ).toEqual(["canonical-raw-method"]);
  });

  it("blocks wrapped canonical db receivers", () => {
    expect(
      kinds(`
        import { db } from "@/lib/db";
        await (db).$queryRaw\`SELECT 1\`;
        await (db as unknown as { $executeRawUnsafe(sql: string): unknown })
          .$executeRawUnsafe("DELETE FROM Customer");
        await db!.$queryRawUnsafe("SELECT 1");
        const { $executeRaw } = (db satisfies object);
      `),
    ).toEqual([
      "canonical-raw-method",
      "canonical-raw-method",
      "canonical-raw-method",
      "canonical-raw-method",
    ]);
  });

  it("blocks destructured raw methods but permits ordinary delegate calls", () => {
    expect(
      kinds(`
        const { db } = await import("@/lib/db");
        const { $queryRaw } = db;
      `),
    ).toEqual(["canonical-raw-method"]);
    expect(
      kinds(`
        import { db } from "@/lib/db";
        await db.customer.findMany();
      `),
    ).toEqual([]);
  });
});
