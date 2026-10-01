process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { TEST_SHOP_CONTEXT } from "@/lib/data/__tests__/helpers";

/** A simulated seller sheet behind the bridge. */
const sheet = vi.hoisted(() => ({
  rows: [] as Array<{ row: number; id: string; cells: Record<string, string> }>,
  written: new Map<string, { status: string; order: string; tracking: string }>(),
}));

vi.mock("../bridge-client", () => ({
  pingBridge: vi.fn(async () => ({
    ok: true,
    version: 1,
    spreadsheetId: "spreadsheet-1",
    spreadsheetName: "Landing orders",
    sheet: "Orders",
    sheets: ["Orders"],
    headers: ["Nom", "Téléphone", "Wilaya", "Produit", "Quantité"],
    rowCount: sheet.rows.length,
  })),
  readBridgeRows: vi.fn(async (_target: unknown, request: { fromRow: number }) => ({
    ok: true,
    rows: sheet.rows.filter((row) => row.row >= request.fromRow),
    nextRow: (sheet.rows.at(-1)?.row ?? 1) + 1,
    lastRow: sheet.rows.at(-1)?.row ?? 1,
  })),
  writeBridgeStatuses: vi.fn(
    async (_target: unknown, request: { updates: Array<{ id: string; status: string; order: string; tracking: string }> }) => {
      for (const update of request.updates) sheet.written.set(update.id, update);
      return { ok: true, updated: request.updates.length, missing: [] };
    },
  ),
}));

import {
  BRIDGE_KEY_SECRET,
  BRIDGE_URL_SECRET,
  defaultBridgeConfig,
  loadBridgeConfig,
  saveBridgeConfig,
} from "../bridge-config";
import { previewSheetImport, runSheetSync } from "../bridge-sync";
import { setSecret } from "@/lib/secrets";

const context = { prisma: rawDb as never, shop: TEST_SHOP_CONTEXT };

async function connect() {
  await setSecret(context, BRIDGE_URL_SECRET, `https://script.google.com/macros/s/${"A".repeat(30)}/exec`);
  await setSecret(context, BRIDGE_KEY_SECRET, "k".repeat(43));
  await saveBridgeConfig(context, {
    ...defaultBridgeConfig(),
    spreadsheetId: "spreadsheet-1",
    spreadsheetName: "Landing orders",
    sheet: "Orders",
    sheets: ["Orders"],
    headers: ["Nom", "Téléphone", "Wilaya", "Produit", "Quantité"],
    mapping: {
      Nom: "customerName",
      "Téléphone": "phone",
      Wilaya: "wilaya",
      Produit: "productName",
      "Quantité": "quantity",
    },
    statusLanguage: "fr",
  });
}

async function catalogProduct(name: string, price: number) {
  const category = await rawDb.category.create({ data: { name: `Sheets ${crypto.randomUUID()}` } });
  return rawDb.product.create({
    data: { name, price, stock: 50, isActive: true, categoryId: category.id },
  });
}

beforeEach(async () => {
  await cleanDb();
  sheet.rows = [];
  sheet.written.clear();
});
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("Google Sheets bridge sync", () => {
  it("imports new rows once, as pending orders, and writes status back", async () => {
    await catalogProduct("Montre Classic", 4500);
    await connect();
    sheet.rows = [
      { row: 2, id: "row-a", cells: { Nom: "Amina B", "Téléphone": "555123456", Wilaya: "16 - Alger", Produit: "montre classic", "Quantité": "2" } },
      { row: 3, id: "row-b", cells: { Nom: "Yacine K", "Téléphone": "0661234567", Wilaya: "Oran", Produit: "Sac inconnu", "Quantité": "1" } },
    ];

    const first = await runSheetSync(context, { full: true });
    expect(first).toMatchObject({ imported: 1, failed: 1, problem: null });

    const orders = await rawDb.order.findMany({ where: { source: "google_sheets" }, include: { customer: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.status).toBe("pending");
    expect(orders[0]?.wilaya).toBe("Alger");
    expect(orders[0]?.customer.phone).toBe("0555123456");

    expect(sheet.written.get("row-a")).toMatchObject({
      status: "En attente de confirmation",
      order: orders[0]?.orderNumber,
    });
    expect(sheet.written.get("row-b")?.status).toBe("⚠ Non importée: Produit introuvable dans SahelFlow");

    // A second sync (incremental and full) never duplicates the order.
    const again = await runSheetSync(context, { full: true });
    expect(again.imported).toBe(0);
    expect(await rawDb.order.count({ where: { source: "google_sheets" } })).toBe(1);

    // Status changes in SahelFlow reach the sheet.
    await rawDb.order.update({ where: { id: orders[0]!.id }, data: { status: "confirmed" } });
    await runSheetSync(context, { importRows: false });
    expect(sheet.written.get("row-a")?.status).toBe("Confirmée");
  });

  it("previews without creating anything and lists unmatched products", async () => {
    await catalogProduct("Montre Classic", 4500);
    await connect();
    sheet.rows = [
      { row: 2, id: "row-a", cells: { Nom: "Amina B", "Téléphone": "0555123456", Wilaya: "Alger", Produit: "Montre Classic", "Quantité": "1" } },
      { row: 3, id: "row-c", cells: { Nom: "Sara", "Téléphone": "0555000000", Wilaya: "Blida", Produit: "Montre noire", "Quantité": "1" } },
    ];
    const preview = await previewSheetImport(context);
    expect(preview.orders).toBe(1);
    expect(preview.unmatchedProducts).toEqual(["Montre noire"]);
    expect(await rawDb.order.count()).toBe(0);

    // Matching the product once lets the next sync import that row too.
    const config = await loadBridgeConfig(context);
    await saveBridgeConfig(context, { ...config, productAliases: { "montre noire": "Montre Classic" } });
    const result = await runSheetSync(context, { full: true });
    expect(result.imported).toBe(2);
  });
});
