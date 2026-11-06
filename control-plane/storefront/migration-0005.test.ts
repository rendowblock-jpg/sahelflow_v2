import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const { DatabaseSync: Sqlite } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSync };

const ROOT = join(process.cwd(), "control-plane/storefront");
const SCHEMA = readFileSync(join(ROOT, "schema.sql"), "utf8");
const migration = () => readFileSync(join(ROOT, "migrations/0005_allocation_offers.sql"), "utf8");
const COLUMN_LINE = "  offers_json TEXT,\n";

const run = (database: DatabaseSync, sql: string) => database.prepare(sql).run();
const rows = (database: DatabaseSync, sql: string) => database.prepare(sql).all() as Array<Record<string, unknown>>;
const objects = (database: DatabaseSync) =>
  rows(database, "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").map((row) => `${row.type}:${row.name}`);
const columns = (database: DatabaseSync) => rows(database, "PRAGMA table_info(storefront_allocation)");
const OLD_COLUMNS = "release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity";

/** A database as it is in production before this change: today's schema without offers_json. Foreign keys ON, as in D1. */
function oldDatabase(): DatabaseSync {
  expect(SCHEMA).toContain(COLUMN_LINE);
  const database = new Sqlite(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(SCHEMA.replace(COLUMN_LINE, ""));
  run(database, "INSERT INTO storefront (storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key) VALUES ('sf_a', 'ws', 'shop_a', 'a', 'k')");
  for (const [id, parent] of [["rel_a1", "NULL"], ["rel_a2", "'rel_a1'"]]) {
    run(database, `INSERT INTO storefront_release (release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest) VALUES ('${id}', 'sf_a', ${parent}, 'sahara', 'ar', '{}', 'd', 'req_${id}')`);
  }
  run(database, "INSERT INTO storefront_allocation VALUES ('rel_a1', 'p1:base', 1000, 5, 5)");
  run(database, "INSERT INTO storefront_allocation VALUES ('rel_a2', 'p1:base', 1200, 9, 9)");
  run(database, "INSERT INTO storefront_allocation VALUES ('rel_a2', 'p2:base', 800, 4, 4)");
  run(database, "INSERT INTO storefront_shipping_rule VALUES ('rel_a2', '16', 'home', 400)");
  run(database, "INSERT INTO storefront_receipt (receipt_id, storefront_id, release_id, idempotency_key, request_digest, encrypted_customer, wrapped_customer_key, wilaya_code, delivery_mode, subtotal_dzd, shipping_dzd, total_dzd) VALUES ('rcpt_1', 'sf_a', 'rel_a2', 'ck_1', 'dig', 'enc', 'wrap', '16', 'home', 2400, 400, 2800)");
  run(database, "INSERT INTO storefront_receipt_line VALUES ('rcpt_1', 'rel_a2', 'p1:base', 2, 1200)"); // the trigger takes 2 from p1:base
  return database;
}

/** What D1 does with `wrangler d1 execute --file`: the whole file as one transaction. */
function applyAsBatch(database: DatabaseSync, sql: string) {
  database.exec("BEGIN");
  try {
    database.exec(sql);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

describe("migration 0005: allocations can hold a quantity-offer ladder", () => {
  it("is ONE ALTER TABLE ... ADD COLUMN and nothing else (no drop-and-rename rebuild of a parent table)", () => {
    const statements = migration().replace(/--[^\n]*/g, "").split(";").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    expect(statements).toEqual(["ALTER TABLE storefront_allocation ADD COLUMN offers_json TEXT"]);
    expect(migration().replace(/--[^\n]*/g, "")).not.toMatch(/\b(DROP|RENAME|DELETE|INSERT|UPDATE|CREATE)\b/i);
    expect(Buffer.byteLength(migration())).toBeLessThan(4000);
  });

  it("old rows read NULL ('no offers') and keep every old value", () => {
    const database = oldDatabase();
    const before = rows(database, `SELECT ${OLD_COLUMNS} FROM storefront_allocation ORDER BY release_id, item_key`);
    expect(before).toHaveLength(3);
    applyAsBatch(database, migration());
    expect(rows(database, `SELECT ${OLD_COLUMNS} FROM storefront_allocation ORDER BY release_id, item_key`)).toEqual(before);
    expect(rows(database, "SELECT offers_json FROM storefront_allocation")).toEqual([{ offers_json: null }, { offers_json: null }, { offers_json: null }]);
  });

  it("every table, index and trigger is still there, the triggers still work, and no row has lost its parent", () => {
    const database = oldDatabase();
    const before = objects(database);
    applyAsBatch(database, migration());
    expect(objects(database)).toEqual(before);
    expect(before).toContain("trigger:storefront_receipt_allocation_decrement");
    expect(before).toContain("trigger:storefront_receipt_allocation_restore");
    expect(rows(database, "SELECT remaining_quantity AS r FROM storefront_allocation WHERE release_id = 'rel_a2' AND item_key = 'p1:base'")).toEqual([{ r: 7 }]);
    run(database, "UPDATE storefront_receipt SET state = 'rejected' WHERE receipt_id = 'rcpt_1'");
    expect(rows(database, "SELECT remaining_quantity AS r FROM storefront_allocation WHERE release_id = 'rel_a2' AND item_key = 'p1:base'")).toEqual([{ r: 9 }]);
    expect(rows(database, "PRAGMA foreign_key_check")).toEqual([]);
    expect(rows(database, "SELECT count(*) AS n FROM storefront_receipt_line")).toEqual([{ n: 1 }]);
  });

  it("deleting a release still removes its allocations (the cascade is intact)", () => {
    const database = oldDatabase();
    applyAsBatch(database, migration());
    run(database, "INSERT INTO storefront_release (release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest) VALUES ('rel_a3', 'sf_a', 'rel_a2', 'sahara', 'ar', '{}', 'd', 'req_rel_a3')");
    run(database, "INSERT INTO storefront_allocation VALUES ('rel_a3', 'p1:base', 1000, 5, 5, '[{\"q\":2,\"t\":1900}]')");
    run(database, "DELETE FROM storefront_release WHERE release_id = 'rel_a3'");
    expect(rows(database, "SELECT count(*) AS n FROM storefront_allocation WHERE release_id = 'rel_a3'")).toEqual([{ n: 0 }]);
    expect(rows(database, "SELECT count(*) AS n FROM storefront_allocation")).toEqual([{ n: 3 }]);
  });

  it("the migrated shape equals schema.sql (same columns, same order, same objects)", () => {
    const migrated = oldDatabase();
    applyAsBatch(migrated, migration());
    const fresh = new Sqlite(":memory:");
    fresh.exec(SCHEMA);
    expect(columns(migrated)).toEqual(columns(fresh));
    expect(columns(fresh).map((column) => column.name)).toEqual([...OLD_COLUMNS.split(", "), "offers_json"]);
    expect(objects(migrated)).toEqual(objects(fresh));
    const nullable = columns(fresh).find((column) => column.name === "offers_json");
    expect(nullable).toMatchObject({ type: "TEXT", notnull: 0, dflt_value: null });
  });

  it("is a once-only file: a second run fails and changes nothing (D1 records applied files)", () => {
    const database = oldDatabase();
    applyAsBatch(database, migration());
    expect(() => applyAsBatch(database, migration())).toThrow(/duplicate column/i);
    expect(columns(database)).toHaveLength(6);
  });
});
