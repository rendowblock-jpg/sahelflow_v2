import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

const { DatabaseSync: SqliteDatabase } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: typeof DatabaseSync;
};

import { createDefaultStorefrontTheme } from "../../src/lib/storefront/theme-default";
import { createStorefrontReleaseInput } from "../../src/lib/storefront/release-artifact";
import { completeReceipt } from "./receipts";
import { publishRelease } from "./publish-release";
import type { D1Database, D1Statement, StorefrontWorkerEnvironment } from "./types";

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const STOREFRONT = "storefront_12345678";
const SHOP = "shop_12345678";
const RELEASE = "release_12345678";

function openDatabase(): DatabaseSync {
  const database = new SqliteDatabase(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(readFileSync(join(process.cwd(), "control-plane/storefront/schema.sql"), "utf8"));
  return database;
}

class SqliteStatement implements D1Statement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1Statement {
    const statement = new SqliteStatement(this.database, this.sql);
    statement.values = values.map((value): SQLInputValue => {
      if (value == null) return null;
      if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
      if (value instanceof Uint8Array) return value;
      throw new Error("Unsupported D1 bind value");
    });
    return statement;
  }

  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ success: boolean; results?: T[] }> {
    return {
      success: true,
      results: this.database.prepare(this.sql).all(...this.values) as T[],
    };
  }

  async run(): Promise<{ success: boolean; meta?: { changes?: number; last_row_id?: number } }> {
    const outcome = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: Number(outcome.changes), last_row_id: Number(outcome.lastInsertRowid) },
    };
  }
}

function d1(database: DatabaseSync): D1Database {
  return {
    prepare(query: string): D1Statement {
      return new SqliteStatement(database, query);
    },
    async batch(statements: D1Statement[]) {
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function environment(database: DatabaseSync): StorefrontWorkerEnvironment {
  return {
    DB: d1(database),
    CONTROL: {
      fetch: async () => Response.json({ workspaceId: WORKSPACE, shopSlots: 1 }),
    },
    CHECKOUT_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
}

function desktopPost(body: unknown): Request {
  return new Request("https://storefront.test/publish", {
    method: "POST",
    headers: { Authorization: "Bearer desktop", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function releaseBody(price: number, quantity: number, fee: number): Record<string, unknown> {
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: fee }];
  return createStorefrontReleaseInput({
    workspaceId: WORKSPACE,
    releaseId: RELEASE,
    parentReleaseId: null,
    locale: "ar",
    draft: {
      name: "Sahel store",
      slug: "sahel-store",
      description: "",
      theme,
      selectedProductIds: ["product_12345678"],
      isActive: true,
    },
    products: [{
      id: "product_12345678",
      name: "Product",
      sku: "SKU-1",
      images: null,
      price,
      stock: quantity,
      productVariants: [],
    }],
  });
}

describe("hosted storefront allocation authority", () => {
  it("restores rejected receipt quantity once", async () => {
    const database = openDatabase();
    database.exec(`
      INSERT INTO storefront (
        storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key, state
      ) VALUES (
        '${STOREFRONT}', '${WORKSPACE}', '${SHOP}', 'sahel-store', 'desktop-key', 'active'
      );
      INSERT INTO storefront_release (
        release_id, storefront_id, parent_release_id, template_id, locale, artifact_json, artifact_digest
      ) VALUES (
        '${RELEASE}', '${STOREFRONT}', NULL, 'sahara', 'ar', '{}', '${"a".repeat(64)}'
      );
      INSERT INTO storefront_allocation (
        release_id, item_key, unit_price_dzd, delegated_quantity, remaining_quantity
      ) VALUES ('${RELEASE}', 'product_12345678:base', 2500, 10, 10);
      INSERT INTO storefront_receipt (
        receipt_id, storefront_id, release_id, idempotency_key, request_digest,
        encrypted_customer, wrapped_customer_key, wilaya_code, delivery_mode,
        subtotal_dzd, shipping_dzd, total_dzd, state
      ) VALUES (
        'receipt_12345678', '${STOREFRONT}', '${RELEASE}', 'checkout_12345678', '${"b".repeat(64)}',
        'cipher', 'wrapped', '16', 'home', 5000, 500, 5500, 'received'
      );
      INSERT INTO storefront_receipt_line (
        receipt_id, release_id, item_key, quantity, unit_price_dzd
      ) VALUES ('receipt_12345678', '${RELEASE}', 'product_12345678:base', 2, 2500);
    `);
    const remaining = () =>
      Number(database.prepare(
        "SELECT remaining_quantity AS qty FROM storefront_allocation WHERE item_key = 'product_12345678:base'",
      ).get()?.qty);
    expect(remaining()).toBe(8);

    const env = environment(database);
    const digest = "c".repeat(64);
    const body = { workspaceId: WORKSPACE, shopId: SHOP, state: "rejected", resultDigest: digest };
    const first = await completeReceipt(desktopPost(body), env, "receipt_12345678");
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ status: "rejected" });
    expect(remaining()).toBe(10);

    const replay = await completeReceipt(desktopPost(body), env, "receipt_12345678");
    expect(replay.status).toBe(200);
    expect(remaining()).toBe(10);

    database.prepare(
      "UPDATE storefront_receipt SET state = 'rejected' WHERE receipt_id = 'receipt_12345678'",
    ).run();
    expect(remaining()).toBe(10);
    database.close();
  });

  it("does not treat a price change as a published replay", async () => {
    const database = openDatabase();
    database.exec(`
      INSERT INTO storefront (
        storefront_id, workspace_id, shop_id, slug, receipt_encryption_public_key, state
      ) VALUES (
        '${STOREFRONT}', '${WORKSPACE}', '${SHOP}', 'sahel-store', 'desktop-key', 'active'
      );
    `);
    const env = environment(database);
    const original = releaseBody(2500, 10, 500);
    const created = await publishRelease(desktopPost(original), env, STOREFRONT);
    expect(created.status).toBe(201);
    await expect(created.json()).resolves.toMatchObject({ status: "published", replay: false });

    const repriced = releaseBody(2600, 10, 500);
    const changed = await publishRelease(desktopPost(repriced), env, STOREFRONT);
    expect(changed.status).toBe(409);
    await expect(changed.json()).resolves.toMatchObject({ error: "release_idempotency_conflict" });
    expect(changed.status).not.toBe(200);
    const price = database.prepare(
      "SELECT unit_price_dzd AS price, remaining_quantity AS qty FROM storefront_allocation",
    ).get() as { price: number; qty: number };
    expect(price).toMatchObject({ price: 2500, qty: 10 });

    const replay = await publishRelease(desktopPost(original), env, STOREFRONT);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toMatchObject({ status: "published", replay: true });
    const afterReplay = database.prepare(
      "SELECT unit_price_dzd AS price, remaining_quantity AS qty FROM storefront_allocation",
    ).get() as { price: number; qty: number };
    expect(afterReplay).toMatchObject({ price: 2500, qty: 10 });
    database.close();
  });
});
