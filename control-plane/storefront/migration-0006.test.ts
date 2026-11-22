import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const { DatabaseSync: Sqlite } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSync };
const ROOT = join(process.cwd(), "control-plane/storefront");
const SCHEMA = readFileSync(join(ROOT, "schema.sql"), "utf8");
const migration = () => readFileSync(join(ROOT, "migrations/0006_receipt_discount.sql"), "utf8");
const COLUMN_LINE = "  discount_dzd INTEGER NOT NULL DEFAULT 0 CHECK(discount_dzd >= 0),\n";

function oldDatabase(): DatabaseSync {
  expect(SCHEMA).toContain(COLUMN_LINE);
  const database = new Sqlite(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(SCHEMA.replace(COLUMN_LINE, ""));
  database.prepare("INSERT INTO storefront (storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key) VALUES ('sf_a', 'ws', 'shop_a', 'a', 'k')").run();
  database.prepare("INSERT INTO storefront_release (release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest, request_digest) VALUES ('rel_1', 'sf_a', NULL, 'sahara', 'ar', '{}', 'd', 'req_1')").run();
  database.prepare("INSERT INTO storefront_allocation (release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity) VALUES ('rel_1', 'p1:base', 3000, 10, 10)").run();
  database.prepare("INSERT INTO storefront_receipt (receipt_id, storefront_id, release_id, idempotency_key, request_digest, encrypted_customer, wrapped_customer_key, wilaya_code, delivery_mode, subtotal_dzd, shipping_dzd, total_dzd) VALUES ('rcpt_old', 'sf_a', 'rel_1', 'ck_old', 'dig', 'enc', 'wrap', '16', 'home', 6000, 400, 6400)").run();
  return database;
}

describe("migration 0006: storefront_receipt.discount_dzd", () => {
  it("is ONE ALTER TABLE ... ADD COLUMN and nothing else", () => {
    const statements = migration().replace(/--[^\n]*/g, "").split(";").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    expect(statements).toEqual(["ALTER TABLE storefront_receipt ADD COLUMN discount_dzd INTEGER NOT NULL DEFAULT 0 CHECK(discount_dzd >= 0)"]);
  });

  it("backfills existing receipts with discount_dzd = 0 and rejects negative discounts", () => {
    const db = oldDatabase();
    db.exec("BEGIN");
    db.exec(migration());
    db.exec("COMMIT");

    const oldRow = db.prepare("SELECT discount_dzd, total_dzd FROM storefront_receipt WHERE receipt_id = 'rcpt_old'").get() as { discount_dzd: number; total_dzd: number };
    expect(oldRow).toEqual({ discount_dzd: 0, total_dzd: 6400 });

    expect(() =>
      db.prepare("INSERT INTO storefront_receipt (receipt_id, storefront_id, release_id, idempotency_key, request_digest, encrypted_customer, wrapped_customer_key, wilaya_code, delivery_mode, subtotal_dzd, discount_dzd, shipping_dzd, total_dzd) VALUES ('rcpt_bad', 'sf_a', 'rel_1', 'ck_bad', 'dig', 'enc', 'wrap', '16', 'home', 6000, -100, 400, 6500)").run(),
    ).toThrow();
    db.close();
  });
});
