import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  TEST_SHOP_CONTEXT,
  createTestPrisma,
  disconnectTestPrisma,
  seedProduct,
} from "@/lib/data/__tests__/helpers";
import {
  projectionBuildStats,
  projectionIndexShape,
  searchProjectedConversations,
  searchProjectedProducts,
} from "@/lib/search/local-search-projection";

/** S09b-02: a write must refresh the ONE changed row of the palette index, not rebuild the whole index. */
const probe = vi.hoisted(() => ({ conversationRowsRead: 0 }));
vi.mock("@/lib/db", async () => {
  const { PrismaClient: Client } = await import("@prisma/client");
  const helpers = await import("@/lib/data/__tests__/helpers");
  const base = new Client();
  // A "full" conversation read is the one that selects the contact fields (the expensive, decrypting one).
  const selectsContact = (args: unknown): boolean => {
    if (typeof args !== "object" || args === null || !("select" in args)) return false;
    const select = args.select;
    return typeof select === "object" && select !== null && "contactName" in select;
  };
  const db = base.$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) {
          const result = await query(args);
          if (model === "Conversation" && operation === "findMany" && Array.isArray(result) && selectsContact(args)) {
            probe.conversationRowsRead += result.length;
          }
          return result;
        },
      },
    },
  });
  return { db, shopContext: helpers.TEST_SHOP_CONTEXT };
});

const SHOP = TEST_SHOP_CONTEXT.shopId;
const WRITES = 100;
const NAMES = [
  "أحمد بن علي", "احمد بن علي", "Ahmed Benali", "Ahmad Ben Ali", "فاطمة الزهراء", "فاطمه الزهراء",
  "Yacine Meziane", "ياسين مزيان", "عبد الرحمن", "Abderrahmane", "Karim Haddad", "كريم حداد",
  "Nadia Bouzid", "نادية بوزيد", "Samir", "سمير", "Lina", "لينا", "Omar", "عمر",
];
const QUERIES = ["ahmed", "أحمد", "احمد", "ahmad", "فاطمة", "yacine", "0661234567", "٠٦٦١٢٣٤٥٦٧", "zoubir", "عبد الرحمن"];

let seed: PrismaClient;
const conversationIds: string[] = [];
const productIds: string[] = [];

function resetCache(): void {
  (globalThis as unknown as { sahelflowLocalSearchProjection?: Map<string, unknown> }).sahelflowLocalSearchProjection?.clear();
}
function idAt(list: readonly string[], index: number): string {
  const value = list[index];
  if (value === undefined) throw new Error(`no seeded id at ${index}`);
  return value;
}
function millis(value: string | number | Date | null | undefined): number {
  if (value === null || value === undefined) throw new Error("the candidate has no date");
  return new Date(value).getTime();
}
async function snapshot(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const query of QUERIES) {
    out[query] = (await searchProjectedConversations(SHOP, query, 48)).map((row) => `${row.id}:${row.label}`);
  }
  return out;
}
async function conversationsFor(queries: readonly string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const query of queries) for (const row of await searchProjectedConversations(SHOP, query, 48)) ids.add(row.entityId);
  return ids;
}
async function productsFor(queries: readonly string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  for (const query of queries) for (const row of await searchProjectedProducts(SHOP, query, 48)) ids.add(row.entityId);
  return ids;
}
/** The shape a from-scratch build gives (the cache is emptied, one search builds it again). */
async function freshShape(slot: "conversation" | "product"): Promise<string[]> {
  resetCache();
  if (slot === "conversation") await searchProjectedConversations(SHOP, "karim");
  else await searchProjectedProducts(SHOP, "gamma");
  return projectionIndexShape(SHOP, slot);
}

beforeAll(async () => {
  seed = await createTestPrisma();
  for (const [i, name] of NAMES.entries()) {
    const row = await seed.conversation.create({
      data: { channel: "whatsapp", contactName: name, contactPhone: `066123${String(4000 + i)}`, lastMessageAt: new Date(1_700_000_000_000 + i) },
    });
    conversationIds.push(row.id);
  }
  const category = await seed.category.create({ data: { name: "w194" } });
  for (let i = 0; i < 10; i += 1) {
    productIds.push((await seedProduct(seed, { name: `Gamma ${i}`, sku: `W194-${i}`, categoryId: category.id })).id);
  }
});
afterAll(async () => {
  await seed.conversation.deleteMany({});
  await seed.product.deleteMany({});
  await seed.category.deleteMany({});
  await disconnectTestPrisma(seed);
});

describe("conversation palette index", () => {
  it("over 100 message writes reads exactly the 100 changed rows, never the whole index again", async () => {
    resetCache();
    await searchProjectedConversations(SHOP, "ahmed"); // the one full build
    const afterBuild = probe.conversationRowsRead;
    expect(afterBuild).toBe(NAMES.length);
    const fullBefore = projectionBuildStats().conversation.full;
    for (let i = 0; i < WRITES; i += 1) {
      await seed.conversation.update({
        where: { id: idAt(conversationIds, i % conversationIds.length) },
        data: { lastMessageAt: new Date(1_800_000_000_000 + i * 1000) },
      });
      await searchProjectedConversations(SHOP, "ahmed");
    }
    expect(probe.conversationRowsRead - afterBuild).toBe(WRITES);
    expect(projectionBuildStats().conversation.full - fullBefore).toBe(0);
    expect(projectionBuildStats().conversation.patchedRows).toBeGreaterThanOrEqual(WRITES);
  });

  it("a patched index answers exactly what a fresh full build answers (rename, delete, insert)", async () => {
    await seed.conversation.update({ where: { id: idAt(conversationIds, 3) }, data: { contactName: "Zoubir Hamdi" } });
    await seed.conversation.delete({ where: { id: idAt(conversationIds, 5) } });
    const added = await seed.conversation.create({
      data: { channel: "whatsapp", contactName: "أحمد الجديد", contactPhone: "0661234567", lastMessageAt: new Date() },
    });
    conversationIds.push(added.id);
    // A raw write moves lastMessageAt without touching updatedAt: the patch must still see that row.
    await seed.$executeRawUnsafe('UPDATE "Conversation" SET "lastMessageAt" = ? WHERE "id" = ?', 1_900_000_000_000, idAt(conversationIds, 6));
    const yacine = await searchProjectedConversations(SHOP, "yacine");
    expect(millis(yacine.find((row) => row.entityId === idAt(conversationIds, 6))?.updatedAt)).toBe(1_900_000_000_000);
    const patched = await snapshot();
    expect((patched["zoubir"] ?? []).some((entry) => entry.endsWith("Zoubir Hamdi"))).toBe(true);
    expect(Object.values(patched).flat().some((entry) => entry.startsWith(`conversation:${idAt(conversationIds, 5)}:`))).toBe(false);
    expect((patched["٠٦٦١٢٣٤٥٦٧"] ?? []).some((entry) => entry.startsWith(`conversation:${added.id}:`))).toBe(true);
    resetCache();
    expect(await snapshot()).toEqual(patched);
  });

  it("rename: the OLD name finds nothing, the NEW name (Arabic spellings) finds the row, no old key stays filed", async () => {
    resetCache();
    await searchProjectedConversations(SHOP, "karim"); // the one full build
    const row = await seed.conversation.create({
      data: { channel: "whatsapp", contactName: "Soumia Hadjadj", contactPhone: "0770000001", lastMessageAt: new Date(1_700_000_100_000) },
    });
    expect((await conversationsFor(["soumia", "hadjadj"])).has(row.id)).toBe(true); // patched in
    await seed.conversation.update({ where: { id: row.id }, data: { contactName: "إلهام بوعزة" } });
    expect((await conversationsFor(["soumia", "hadjadj", "Soumia Hadjadj"])).has(row.id)).toBe(false);
    // alef with hamza, plain alef, ة written as ه, and a fatha on the lam-ha-alef spelling
    for (const spelling of ["إلهام", "الهام", "بوعزه", "ال\u0647\u064Eام"]) {
      expect((await conversationsFor([spelling])).has(row.id)).toBe(true);
    }
    const patched = await projectionIndexShape(SHOP, "conversation");
    expect(await freshShape("conversation")).toEqual(patched);
  });

  it("delete: the id never comes back from any query, also after an unrelated insert and after another patch", async () => {
    resetCache();
    await searchProjectedConversations(SHOP, "karim");
    const doomed = await seed.conversation.create({
      data: { channel: "whatsapp", contactName: "Rafik Doomed", contactPhone: "0770000002", lastMessageAt: new Date(1_700_000_200_000) },
    });
    const asks = ["rafik", "doomed", "Rafik Doomed", "0770000002", "٠٧٧٠٠٠٠٠٠٢"];
    expect((await conversationsFor(asks)).has(doomed.id)).toBe(true);
    await seed.conversation.delete({ where: { id: doomed.id } });
    expect((await conversationsFor(asks)).has(doomed.id)).toBe(false);
    const other = await seed.conversation.create({
      data: { channel: "whatsapp", contactName: "Tarek Unrelated", contactPhone: "0770000003", lastMessageAt: new Date(1_700_000_300_000) },
    });
    expect((await conversationsFor(asks)).has(doomed.id)).toBe(false);
    await seed.conversation.update({ where: { id: other.id }, data: { contactName: "Tarek Patched" } });
    expect((await conversationsFor([...asks, "tarek"])).has(doomed.id)).toBe(false);
    const patched = await projectionIndexShape(SHOP, "conversation");
    expect(patched.some((line) => line.includes(doomed.id))).toBe(false);
    expect(await freshShape("conversation")).toEqual(patched);
  });
});

describe("product palette index", () => {
  it("over 100 renames builds the index once and patches 100 rows", async () => {
    resetCache();
    await searchProjectedProducts(SHOP, "gamma");
    const fullBefore = projectionBuildStats().product.full;
    const patchedBefore = projectionBuildStats().product.patchedRows;
    for (let i = 0; i < WRITES; i += 1) {
      await seed.product.update({ where: { id: idAt(productIds, i % productIds.length) }, data: { name: `Gamma ${i} v${i}` } });
      const found = await searchProjectedProducts(SHOP, `v${i}`);
      expect(found.some((row) => row.label === `Gamma ${i} v${i}`)).toBe(true);
    }
    expect(projectionBuildStats().product.full - fullBefore).toBe(0);
    expect(projectionBuildStats().product.patchedRows - patchedBefore).toBe(WRITES);
  });

  it("rename (Arabic variants): the old name and its spellings find nothing, the new name finds the row, shape equals a fresh build", async () => {
    const category = await seed.category.create({ data: { name: "w194-variants" } });
    resetCache();
    await searchProjectedProducts(SHOP, "gamma");
    const product = await seedProduct(seed, { name: "قميص أبيض", sku: "W194-AR-1", categoryId: category.id });
    expect((await productsFor(["قميص", "ابيض"])).has(product.id)).toBe(true);
    await seed.product.update({ where: { id: product.id }, data: { name: "سروال جينز" } });
    expect((await productsFor(["قميص", "ابيض", "أبيض", "قميص أبيض"])).has(product.id)).toBe(false);
    expect((await productsFor(["سروال", "جينز"])).has(product.id)).toBe(true);
    const patched = await projectionIndexShape(SHOP, "product");
    expect(await freshShape("product")).toEqual(patched);
  });

  it("delete (soft): the id never comes back, also after an unrelated insert and after another patch", async () => {
    const category = await seed.category.create({ data: { name: "w194-delete" } });
    resetCache();
    await searchProjectedProducts(SHOP, "gamma");
    const doomed = await seedProduct(seed, { name: "Doomed Lamp", sku: "W194-DEL-1", categoryId: category.id });
    const asks = ["doomed", "lamp", "W194-DEL-1"];
    expect((await productsFor(asks)).has(doomed.id)).toBe(true);
    await seed.product.update({ where: { id: doomed.id }, data: { deletedAt: new Date() } });
    expect((await productsFor(asks)).has(doomed.id)).toBe(false);
    const other = await seedProduct(seed, { name: "Unrelated Chair", sku: "W194-DEL-2", categoryId: category.id });
    expect((await productsFor(asks)).has(doomed.id)).toBe(false);
    await seed.product.update({ where: { id: other.id }, data: { name: "Patched Chair" } });
    expect((await productsFor([...asks, "chair"])).has(doomed.id)).toBe(false);
    const patched = await projectionIndexShape(SHOP, "product");
    expect(patched.some((line) => line.includes(doomed.id))).toBe(false);
    expect(await freshShape("product")).toEqual(patched);
  });
});
