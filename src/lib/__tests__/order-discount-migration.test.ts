import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

// node:sqlite is loaded through require so Vite does not try to resolve the "node:" scheme itself.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

const MIGRATIONS = fileURLToPath(new URL("../../../prisma/migrations/", import.meta.url));
const NEW_MIGRATION = "20261107120000_order_discount";

function migrationNames(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => statSync(join(MIGRATIONS, name)).isDirectory())
    .sort();
}

function sqlOf(name: string): string {
  return readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8");
}

/** The SQL a migration really runs: comments removed, one entry per statement. */
function statementsOf(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** A database as it is on a desktop that has every migration before this one. */
function databaseBefore(): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(":memory:");
  for (const name of migrationNames().filter((candidate) => candidate < NEW_MIGRATION)) {
    db.exec(sqlOf(name));
  }
  // Some migrations end with PRAGMA foreign_keys=ON; the bare Order rows below have no Customer.
  db.exec("PRAGMA foreign_keys = OFF");
  return db;
}

/** Inserts one Order naming only the columns that have no default, whatever the table looks like today. */
function insertOrder(db: InstanceType<typeof DatabaseSync>, id: string): void {
  const columns = (
    db.prepare('PRAGMA table_info("Order")').all() as Array<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>
  ).filter((column) => column.pk > 0 || (column.notnull === 1 && column.dflt_value === null));
  const values = columns.map((column) => {
    if (column.name === "id") return id;
    if (column.type === "INTEGER") return 0;
    if (column.type === "DATETIME") return "2026-11-01 00:00:00";
    return `${column.name}-${id}`;
  });
  db.prepare(
    `INSERT INTO "Order" (${columns.map((column) => `"${column.name}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
  ).run(...values);
}

describe("Order.discountDzd migration (item 2 money)", () => {
  it("is the newest migration and changes nothing but adding one column that defaults to 0", () => {
    expect(migrationNames().at(-1)).toBe(NEW_MIGRATION);
    const sql = sqlOf(NEW_MIGRATION);
    const statements = statementsOf(sql);
    expect(statements).toEqual(['ALTER TABLE "Order" ADD COLUMN "discountDzd" INTEGER NOT NULL DEFAULT 0']);
    expect(sql.replace(/--[^\n]*/g, "")).not.toMatch(/\b(DROP|RENAME|UPDATE|INSERT|DELETE)\b/i);
  });

  it("gives every order that existed before the migration a discount of 0 and keeps its other values", () => {
    const db = databaseBefore();
    insertOrder(db, "old-1");
    insertOrder(db, "old-2");
    db.exec(sqlOf(NEW_MIGRATION));
    const rows = db.prepare('SELECT "id", "discountDzd", "totalPrice" FROM "Order" ORDER BY "id"').all();
    expect(rows).toEqual([
      { id: "old-1", discountDzd: 0, totalPrice: 0 },
      { id: "old-2", discountDzd: 0, totalPrice: 0 },
    ]);
  });

  it("gives an order written without naming the column a discount of 0", () => {
    const db = databaseBefore();
    db.exec(sqlOf(NEW_MIGRATION));
    insertOrder(db, "new-1");
    expect(db.prepare('SELECT "discountDzd" FROM "Order" WHERE "id" = ?').get("new-1")).toEqual({ discountDzd: 0 });
  });

  it("is a field of the Prisma Order model", () => {
    expect(Prisma.OrderScalarFieldEnum).toHaveProperty("discountDzd");
  });
});
