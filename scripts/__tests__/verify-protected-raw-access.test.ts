import { describe, expect, it } from "vitest";

import { rawClientImports } from "../verify-protected-raw-access";

function kinds(source: string): string[] {
  return rawClientImports(source).map((finding) => finding.kind);
}

describe("protected raw-client import parser", () => {
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
});
