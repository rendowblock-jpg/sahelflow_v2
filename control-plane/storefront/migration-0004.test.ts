import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const { DatabaseSync: Sqlite } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSync };

const ROOT = join(process.cwd(), "control-plane/storefront");
const SCHEMA = readFileSync(join(ROOT, "schema.sql"), "utf8");
const MIGRATION = readFileSync(join(ROOT, "migrations/0004_template_ids_five_styles.sql"), "utf8");

const NEW_LIST = "'sahara','atlas','oasis','prime','souk','reel'";
const OLD_LIST = "'sahara','atlas','oasis'";

/** A database as it was before this change: same schema, the narrow template CHECK. Foreign keys ON, as in D1. */
function oldDatabase(): DatabaseSync {
  expect(SCHEMA).toContain(NEW_LIST);
  const database = new Sqlite(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(SCHEMA.replace(NEW_LIST, OLD_LIST));
  return database;
}

const run = (database: DatabaseSync, sql: string, ...values: Array<string | number | null>) => database.prepare(sql).run(...values);
const rows = (database: DatabaseSync, sql: string) => database.prepare(sql).all() as Array<Record<string, unknown>>;

const ARTIFACT = JSON.stringify({ storeName: "x", products: [] });
function insertRelease(database: DatabaseSync, id: string, storefront: string, parent: string | null, template = "sahara") {
  run(
    database,
    "INSERT INTO storefront_release (release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest) VALUES (?, ?, ?, ?, 'ar', ?, 'd', ?)",
    id, storefront, parent, template, ARTIFACT, `req_${id}`,
  );
}

/**
 * Two stores: A active with a two-release chain, B paused with one release.
 * "full" adds what references a release WITHOUT a cascade (an order with a line, a retirement, a pause record);
 * "plain" has only the rows that cascade (allocations, shipping rules) and the photo ledger.
 */
function seed(database: DatabaseSync, level: "full" | "plain" = "full") {
  run(database, "INSERT INTO storefront (storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key) VALUES ('sf_a', 'ws', 'shop_a', 'a', 'k')");
  run(database, "INSERT INTO storefront (storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key) VALUES ('sf_b', 'ws', 'shop_b', 'b', 'k')");
  insertRelease(database, "rel_a1", "sf_a", null);
  insertRelease(database, "rel_a2", "sf_a", "rel_a1", "atlas");
  insertRelease(database, "rel_b1", "sf_b", null, "oasis");
  run(database, "UPDATE storefront SET state = 'paused' WHERE storefront_id = 'sf_b'");
  for (const [release, key, price, qty] of [["rel_a1", "p1:base", 1000, 5], ["rel_a2", "p1:base", 1200, 9], ["rel_a2", "p2:base", 800, 4], ["rel_b1", "p9:base", 500, 7]] as const) {
    run(database, "INSERT INTO storefront_allocation VALUES (?, ?, ?, ?, ?)", release, key, price, qty, qty);
  }
  for (const [release, wilaya, mode, fee] of [["rel_a2", "16", "home", 400], ["rel_a2", "16", "desk", 250], ["rel_a2", "31", "home", 650], ["rel_b1", "16", "home", 400]] as const) {
    run(database, "INSERT INTO storefront_shipping_rule VALUES (?, ?, ?, ?)", release, wilaya, mode, fee);
  }
  run(database, "INSERT INTO storefront_media VALUES ('sf_a', 'abc', 640, 1000, 'sha', CURRENT_TIMESTAMP)");
  if (level === "full") {
    run(database, "INSERT INTO storefront_allocation_retirement (operation_id, storefront_id, source_release_id, item_key, retired_quantity, reason) VALUES ('op1', 'sf_a', 'rel_a1', 'p1:base', 2, 'publish')");
    run(database, "INSERT INTO storefront_pause_operation (operation_id, storefront_id, workspace_id, source_release_id) VALUES ('pause1', 'sf_b', 'ws', 'rel_b1')");
    run(database, "INSERT INTO storefront_receipt (receipt_id, storefront_id, release_id, idempotency_key, request_digest, encrypted_customer, wrapped_customer_key, wilaya_code, delivery_mode, subtotal_dzd, shipping_dzd, total_dzd) VALUES ('rcpt_1', 'sf_a', 'rel_a2', 'ck_1', 'dig', 'enc', 'wrap', '16', 'home', 2400, 400, 2800)");
    run(database, "INSERT INTO storefront_receipt_line VALUES ('rcpt_1', 'rel_a2', 'p1:base', 2, 1200)"); // the trigger takes 2 from p1:base
  }
}

const TABLES = [
  "storefront", "storefront_release", "storefront_allocation", "storefront_shipping_rule", "storefront_receipt",
  "storefront_receipt_line", "storefront_allocation_retirement", "storefront_pause_operation", "storefront_media",
] as const;

function snapshot(database: DatabaseSync): Record<string, string[]> {
  return Object.fromEntries(TABLES.map((table) => [table, rows(database, `SELECT * FROM ${table}`).map((row) => JSON.stringify(row, Object.keys(row).sort())).sort()]));
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

const normalise = (sql: string) => sql.replace(/IF NOT EXISTS /gi, "").replace(/["`]/g, "").replace(/\s+/g, " ").trim();
const objects = (database: DatabaseSync) =>
  rows(database, "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").map((row) => `${row.type}:${row.name}`);

describe("migration 0004: existing databases accept prime, souk and reel", () => {
  it("the old shape really refuses the new ids (the situation the migration fixes)", () => {
    const database = oldDatabase();
    seed(database);
    expect(() => insertRelease(database, "rel_x", "sf_a", "rel_a2", "prime")).toThrow(/CHECK constraint/);
  });

  it("keeps every row of every table exactly as it was", () => {
    const database = oldDatabase();
    seed(database);
    const before = snapshot(database);
    expect(before.storefront_allocation).toHaveLength(4);
    expect(before.storefront_shipping_rule).toHaveLength(4);
    applyAsBatch(database, MIGRATION);
    expect(snapshot(database)).toEqual(before);
    expect(rows(database, "PRAGMA foreign_key_check")).toEqual([]);
  });

  it("does not touch a paused store or move any active release while it copies", () => {
    const database = oldDatabase();
    seed(database);
    applyAsBatch(database, MIGRATION);
    expect(rows(database, "SELECT storefront_id, state, active_release_id FROM storefront ORDER BY storefront_id")).toEqual([
      { storefront_id: "sf_a", state: "active", active_release_id: "rel_a2" },
      { storefront_id: "sf_b", state: "paused", active_release_id: "rel_b1" },
    ]);
  });

  it("now accepts the three new ids, still refuses anything else, and the triggers still work", () => {
    const database = oldDatabase();
    seed(database);
    applyAsBatch(database, MIGRATION);
    for (const [index, template] of (["prime", "souk", "reel"] as const).entries()) {
      const parent = index === 0 ? "rel_a2" : `rel_new${index - 1}`;
      insertRelease(database, `rel_new${index}`, "sf_a", parent, template);
      expect(rows(database, "SELECT active_release_id FROM storefront WHERE storefront_id = 'sf_a'")).toEqual([{ active_release_id: `rel_new${index}` }]);
    }
    expect(() => insertRelease(database, "rel_bad", "sf_a", "rel_new2", "vitrine")).toThrow(/CHECK constraint/);
    expect(() => insertRelease(database, "rel_stale", "sf_a", "rel_a1", "prime")).toThrow(/stale_release_parent/);
  });

  it("the ordering of orders still works: stock is taken once and an empty allocation refuses", () => {
    const database = oldDatabase();
    seed(database);
    applyAsBatch(database, MIGRATION);
    expect(rows(database, "SELECT remaining_quantity AS r FROM storefront_allocation WHERE release_id = 'rel_a2' AND item_key = 'p1:base'")).toEqual([{ r: 7 }]);
    run(database, "INSERT INTO storefront_receipt (receipt_id, storefront_id, release_id, idempotency_key, request_digest, encrypted_customer, wrapped_customer_key, wilaya_code, delivery_mode, subtotal_dzd, shipping_dzd, total_dzd) VALUES ('rcpt_2', 'sf_a', 'rel_a2', 'ck_2', 'dig', 'enc', 'wrap', '16', 'home', 1, 1, 2)");
    expect(() => run(database, "INSERT INTO storefront_receipt_line VALUES ('rcpt_2', 'rel_a2', 'p1:base', 8, 1200)")).toThrow(/allocation_exhausted/);
    run(database, "INSERT INTO storefront_receipt_line VALUES ('rcpt_2', 'rel_a2', 'p1:base', 7, 1200)");
    expect(rows(database, "SELECT remaining_quantity AS r FROM storefront_allocation WHERE release_id = 'rel_a2' AND item_key = 'p1:base'")).toEqual([{ r: 0 }]);
    run(database, "UPDATE storefront_receipt SET state = 'rejected' WHERE receipt_id = 'rcpt_2'");
    expect(rows(database, "SELECT remaining_quantity AS r FROM storefront_allocation WHERE release_id = 'rel_a2' AND item_key = 'p1:base'")).toEqual([{ r: 7 }]);
  });

  it("ends with the same tables, triggers and indexes as a fresh install, the same release definition, and nothing left over", () => {
    const migrated = oldDatabase();
    seed(migrated);
    applyAsBatch(migrated, MIGRATION);
    const fresh = new Sqlite(":memory:");
    fresh.exec(SCHEMA);
    expect(objects(migrated)).toEqual(objects(fresh));
    const definition = (database: DatabaseSync) =>
      normalise((rows(database, "SELECT sql FROM sqlite_master WHERE name = 'storefront_release'")[0] as { sql: string }).sql);
    expect(definition(migrated)).toBe(definition(fresh));
    expect(objects(migrated).filter((name) => name.includes("zz_mig0004") || name.includes("_new"))).toEqual([]);
  });

  it("works on a database that has no orders yet, and on a completely empty one", () => {
    const noOrders = oldDatabase();
    seed(noOrders, "plain");
    const before = snapshot(noOrders);
    applyAsBatch(noOrders, MIGRATION);
    expect(snapshot(noOrders)).toEqual(before);
    const empty = oldDatabase();
    applyAsBatch(empty, MIGRATION);
    expect(rows(empty, "SELECT count(*) AS n FROM storefront_release")).toEqual([{ n: 0 }]);
  });

  const NAIVE = `PRAGMA defer_foreign_keys = on;
       CREATE TABLE storefront_release_new (release_id TEXT PRIMARY KEY NOT NULL, storefront_id TEXT NOT NULL, parent_release_id TEXT,
         template_id TEXT NOT NULL CHECK(template_id IN (${NEW_LIST})), locale TEXT NOT NULL, artifact_json TEXT NOT NULL,
         artifact_digest TEXT NOT NULL, request_digest TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
       INSERT INTO storefront_release_new SELECT release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest, created_at FROM storefront_release;
       DROP TABLE storefront_release;
       ALTER TABLE storefront_release_new RENAME TO storefront_release;`;

  it("why it is not the usual rebuild (1): drop-and-rename silently deletes every allocation and shipping rule", () => {
    const database = oldDatabase();
    seed(database, "plain");
    applyAsBatch(database, NAIVE);
    expect(rows(database, "SELECT count(*) AS n FROM storefront_release")).toEqual([{ n: 3 }]);
    expect(rows(database, "SELECT count(*) AS n FROM storefront_allocation")).toEqual([{ n: 0 }]);
    expect(rows(database, "SELECT count(*) AS n FROM storefront_shipping_rule")).toEqual([{ n: 0 }]);
  });

  it("why it is not the usual rebuild (2): with an order on file the same recipe cannot even commit", () => {
    const database = oldDatabase();
    seed(database, "full");
    expect(() => applyAsBatch(database, NAIVE)).toThrow(/FOREIGN KEY constraint failed/);
  });

  it("is written as the header says: held copies first, final name, triggers last, no forbidden pragma", () => {
    const at = (needle: string) => MIGRATION.indexOf(needle);
    expect(at("CREATE TABLE zz_mig0004_hold_release")).toBeGreaterThan(-1);
    expect(at("CREATE TABLE zz_mig0004_hold_shipping_rule")).toBeLessThan(at("DROP TABLE storefront_release;"));
    expect(at("CREATE TABLE storefront_release (")).toBeGreaterThan(at("DROP TABLE storefront_release;"));
    expect(MIGRATION).not.toContain("RENAME TO");
    expect(at("INSERT INTO storefront_allocation")).toBeGreaterThan(at("CREATE TABLE storefront_release ("));
    expect(at("CREATE TRIGGER IF NOT EXISTS storefront_release_activate")).toBeGreaterThan(at("INSERT INTO storefront_shipping_rule"));
    expect(MIGRATION.replace(/--.*$/gm, "")).not.toMatch(/legacy_alter_table|foreign_keys\s*=\s*off|writable_schema/i);
  });


  it("refuses to run over a side table left by an earlier run, and changes nothing (it could be the only copy of the data)", () => {
    const database = oldDatabase();
    seed(database);
    database.exec("CREATE TABLE zz_mig0004_hold_release AS SELECT * FROM storefront_release");
    const before = snapshot(database);
    expect(() => applyAsBatch(database, MIGRATION)).toThrow(/already exists/);
    expect(snapshot(database)).toEqual(before);
    expect(rows(database, "SELECT count(*) AS n FROM zz_mig0004_hold_release")).toEqual([{ n: 3 }]);
  });

  it("run a second time on a migrated database, it rebuilds the same rows and changes nothing", () => {
    const database = oldDatabase();
    seed(database);
    applyAsBatch(database, MIGRATION);
    const once = snapshot(database);
    applyAsBatch(database, MIGRATION);
    expect(snapshot(database)).toEqual(once);
    expect(rows(database, "PRAGMA foreign_key_check")).toEqual([]);
    expect(rows(database, "SELECT storefront_id, state, active_release_id FROM storefront ORDER BY storefront_id")).toEqual([
      { storefront_id: "sf_a", state: "active", active_release_id: "rel_a2" },
      { storefront_id: "sf_b", state: "paused", active_release_id: "rel_b1" },
    ]);
  });
});
