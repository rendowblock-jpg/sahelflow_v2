import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TEST_SHOP_CONTEXT,
  createTestPrisma,
  disconnectTestPrisma,
  seedCustomer,
  seedProduct,
} from "@/lib/data/__tests__/helpers";
import { customerServiceExtensions } from "@/lib/data/extensions/customer-extensions";
import { productServiceExtensions } from "@/lib/data/extensions/product-extensions";
import {
  clearFoldedRowCache,
  foldedRowIds,
  matchesFoldedFields,
  rowSignature,
} from "@/lib/search/list-search-candidates";
import { idsForTokenHashes, tokenLookupSql } from "@/lib/search/local-search-projection";
import { matchesSearchQuery } from "@/lib/search/universal-search";

/** Real SQLite rows; the app's `db` is a counting client on the same test database. */
const probe = vi.hoisted(() => ({ ops: 0 }));
vi.mock("@/lib/db", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  const helpers = await import("@/lib/data/__tests__/helpers");
  const base = new Client();
  const db = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) {
          probe.ops += 1;
          return query(args);
        },
      },
    },
  });
  return { db, shopContext: helpers.TEST_SHOP_CONTEXT };
});

import { db as countedDb } from "@/lib/db";

let seed: PrismaClient;
const ctx = () => ({ prisma: countedDb as never, shop: TEST_SHOP_CONTEXT });

beforeEach(async () => {
  seed = await createTestPrisma();
  clearFoldedRowCache();
  // Only this file's rows: a wipe of the whole token table is slow on a big shop database.
  await seed.searchProjectionToken.deleteMany({
    where: { tokenHash: { in: ["hash-common", "hash-rare"] } },
  });
});
afterEach(async () => {
  await disconnectTestPrisma(seed);
});

describe("token lookup", () => {
  it("keeps a bounded bucket per hash: a very common token cannot starve another hash of the same search", async () => {
    // 500 ids on one hash (more than the whole 2 x 192 budget), one id on the other, sorted last.
    await seed.searchProjectionToken.createMany({
      data: [
        ...Array.from({ length: 500 }, (_, i) => ({
          family: "customer",
          entityId: `c-${String(i).padStart(4, "0")}`,
          tokenHash: "hash-common",
        })),
        { family: "customer", entityId: "c-zzzz-rare", tokenHash: "hash-rare" },
      ],
    });
    const buckets = await idsForTokenHashes("customer", ["hash-common", "hash-rare"]);
    expect(buckets.get("hash-common")?.size).toBe(192);
    expect([...(buckets.get("hash-rare") ?? [])]).toEqual(["c-zzzz-rare"]);
  });

  it("looks the hashes up through the (family, tokenHash) index, not the primary-key index", async () => {
    const plan = await seed.$queryRaw<Array<{ detail: string }>>(
      Prisma.sql`EXPLAIN QUERY PLAN ${tokenLookupSql("customer", ["a", "b", "c"])}`,
    );
    const details = plan.map((row) => row.detail).join("\n");
    expect(details).toContain("SearchProjectionToken_family_tokenHash_idx (family=? AND tokenHash=?)");
    expect(details).not.toContain("sqlite_autoindex");
  });
});

describe("dirty rows on the list-search path", () => {
  it("refreshes at most a few rows itself and still finds a row that is not rebuilt yet by its whole name", async () => {
    const target = await seedCustomer(seed, { name: "Ahmed Benali", phone: "0655123456" });
    for (let i = 0; i < 20; i += 1) {
      await seedCustomer(seed, { name: `Client Numero ${i}`, phone: `0555${String(100000 + i)}` });
    }
    const dirtyBefore = await seed.searchProjectionDirty.count({ where: { family: "customer" } });
    expect(dirtyBefore).toBeGreaterThanOrEqual(21);

    const rows = await customerServiceExtensions.search(ctx(), "Ahmed Benali");

    // The newest rows come first, so the oldest one (the target) is still waiting for the warm-up.
    const dirtyAfter = await seed.searchProjectionDirty.count({ where: { family: "customer" } });
    expect(dirtyBefore - dirtyAfter).toBe(8);
    expect(await seed.searchProjectionToken.count({ where: { family: "customer", entityId: target.id } })).toBe(0);
    expect(rows.map((r) => r.id)).toContain(target.id);
  });
});

describe("folded row cache", () => {
  const rows = [
    { id: "1", name: "Décoratif miroir", sku: "SKU-0012" },
    { id: "2", name: "أحمد", sku: "AHM-1" },
  ];
  const fields = (row: (typeof rows)[number]) => [row.name, row.sku];
  const OLD = Date.now() - 60_000;

  function source(initial = rows) {
    const state = { rows: initial, loads: 0, signature: rowSignature(initial.length, new Date(OLD)) };
    return {
      state,
      load: async () => {
        state.loads += 1;
        return state.rows;
      },
      cache: { key: "test", signature: async () => state.signature },
    };
  }

  it("reads the rows once while the fingerprint is unchanged", async () => {
    const s = source();
    expect(await foldedRowIds(s.load, "decoratif", fields, s.cache)).toEqual(["1"]);
    expect(await foldedRowIds(s.load, "احمد", fields, s.cache)).toEqual(["2"]);
    expect(await foldedRowIds(s.load, "sku0012", fields, s.cache)).toEqual(["1"]);
    expect(s.state.loads).toBe(1);
  });

  it("reads again when a row changed", async () => {
    const s = source();
    expect(await foldedRowIds(s.load, "lampe", fields, s.cache)).toEqual([]);
    s.state.rows = [{ id: "1", name: "Lampe", sku: "SKU-0012" }, rows[1]!];
    s.state.signature = rowSignature(2, new Date(OLD + 5_000));
    expect(await foldedRowIds(s.load, "lampe", fields, s.cache)).toEqual(["1"]);
    expect(s.state.loads).toBe(2);
  });

  it("does not keep rows that were changed in the last second", async () => {
    const s = source();
    s.state.signature = rowSignature(2, new Date());
    await foldedRowIds(s.load, "decoratif", fields, s.cache);
    await foldedRowIds(s.load, "decoratif", fields, s.cache);
    expect(s.state.loads).toBe(2);
  });

  it("reads every time when no fingerprint is available, and returns null over the cap without reading", async () => {
    const s = source();
    const broken = { key: "broken", signature: async () => { throw new Error("no aggregate"); } };
    await foldedRowIds(s.load, "decoratif", fields, broken);
    await foldedRowIds(s.load, "decoratif", fields, broken);
    expect(s.state.loads).toBe(2);
    s.state.signature = rowSignature(5001, new Date(OLD));
    expect(await foldedRowIds(s.load, "decoratif", fields, s.cache)).toBeNull();
    expect(s.state.loads).toBe(2);
  });

  it.each([
    ["decoratif", ["Décoratif miroir", "SKU-0012"]],
    ["DÉCORATIF", ["Décoratif miroir"]],
    ["احمد", ["أحمد"]],
    ["أحمد", ["احمد"]],
    ["sku 0012", ["SKU-0012"]],
    ["+213 655 12 34 56", ["0655123456"]],
    ["0655 12 34 56", ["+213655123456", null]],
    ["miroir decoratif", ["Décoratif miroir"]],
    ["fatima", ["Fatma", ""]],
    ["", ["x"]],
    ["٠٦٥٥١٢٣٤٥٦", ["0655123456"]],
  ])("folds %s exactly like matchesSearchQuery", (q, values) => {
    expect(matchesFoldedFields(q, values)).toBe(matchesSearchQuery(q, values));
  });

  it("shows a rename on the very next product search (real rows)", async () => {
    const product = await seedProduct(seed);
    // An old edit time, so the rows are cached after the first search.
    await seed.product.update({
      where: { id: product.id },
      data: { name: "Décoratif miroir", updatedAt: new Date(OLD) },
    });
    const search = (q: string) => productServiceExtensions.search(ctx(), q);

    probe.ops = 0;
    expect((await search("lampe")).map((r) => r.name)).toEqual([]);
    const firstCost = probe.ops;
    probe.ops = 0;
    expect((await search("decoratif")).map((r) => r.name)).toEqual(["Décoratif miroir"]);
    expect(probe.ops).toBeLessThan(firstCost); // fingerprint + final read, no reload of the rows

    await seed.product.update({ where: { id: product.id }, data: { name: "Lampe moderne" } });
    expect((await search("lampe")).map((r) => r.name)).toEqual(["Lampe moderne"]);
    expect(await search("decoratif")).toEqual([]);
  });
});
