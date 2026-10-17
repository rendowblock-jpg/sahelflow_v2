import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { redactPii } from "@/lib/redact-pii";

/**
 * S03c-03 (audit part only): PATCH /api/products/[id] updated a product with
 * no audit row, while DELETE and restore both write one. A price or cost edit
 * left no trace of who made it.
 *
 * The route is run here with its collaborators mocked (same harness style as
 * product-route-authority.test.ts); a source-pinning block at the end keeps
 * the call shape and the "never log cost or price values" rule visible even if
 * the harness is rewritten.
 */

const harness = vi.hoisted(() => ({
  requireAction: vi.fn(),
  assertAction: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
  logAudit: vi.fn(),
  projectProduct: vi.fn((_: unknown, product: unknown) => product),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireAction,
  assertTrustedAction: harness.assertAction,
  trustedActorAuditIdentity: () => "person:owner-1",
}));

vi.mock("@/lib/identity/product-projection", () => ({
  projectProductForTrustedActor: harness.projectProduct,
}));

vi.mock("@/lib/products/product-workbench", () => ({
  getProductWorkbenchDetail: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  productService: { update: harness.update, delete: vi.fn() },
}));

vi.mock("@/lib/audit", () => ({ logAudit: harness.logAudit }));

vi.mock("@/lib/db", () => ({
  db: { product: { findUnique: harness.findUnique } },
  shopContext: { shopId: "shop-a" },
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => handler(...args),
}));

import { PATCH } from "@/app/api/products/[id]/route";

const actorContext = {
  actor: { kind: "person" },
  shop: { shopId: "shop-a" },
};

// Distinctive numbers so a leak into the audit entry cannot be a coincidence.
const COST = 1_234_567;
const PRICE = 7_654_321;
const OLD_PRICE = 7_000_000;

const stored = {
  id: "p1",
  name: "Widget",
  sku: "W-1",
  price: OLD_PRICE,
  cost: COST,
  stock: 5,
  lowStockThreshold: 5,
  categoryId: null,
  variants: null,
  images: null,
  isActive: true,
};

function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest("http://localhost/api/products/p1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "p1" }) },
  );
}

function auditEntry(): {
  action: string;
  entity: string;
  entityId: string;
  actor: string;
  before?: unknown;
  after?: unknown;
  metadata: { changedFields: Record<string, boolean> };
} {
  expect(harness.logAudit).toHaveBeenCalledTimes(1);
  return harness.logAudit.mock.calls[0]![1];
}

describe("PATCH /api/products/[id] writes an audit row (S03c-03)", () => {
  beforeEach(() => {
    harness.requireAction.mockReset().mockResolvedValue(actorContext);
    harness.assertAction.mockReset();
    harness.findUnique.mockReset().mockResolvedValue({ ...stored });
    harness.update.mockReset().mockResolvedValue({ ...stored, price: PRICE });
    harness.logAudit.mockReset().mockResolvedValue(undefined);
    harness.projectProduct.mockClear();
  });

  it("logs product.updated with the DELETE call shape and only the changed field names", async () => {
    await patch({ name: "Widget", price: PRICE, cost: COST, stock: 5, isActive: true });

    expect(harness.update).toHaveBeenCalledTimes(1);
    const [context, entry] = harness.logAudit.mock.calls[0]!;
    expect(context).toMatchObject({ shop: { shopId: "shop-a" } });
    expect(entry).toMatchObject({
      action: "product.updated",
      entity: "product",
      entityId: "p1",
      actor: "person:owner-1",
    });
    // The form re-sends every field; only the one that differs is named.
    expect(Object.keys(auditEntry().metadata.changedFields)).toEqual(["price"]);
  });

  it("names every field that changed, sorted, including cost", async () => {
    await patch({ name: "Widget 2", price: PRICE, cost: COST + 1, stock: 9, isActive: false });

    expect(Object.keys(auditEntry().metadata.changedFields)).toEqual([
      "cost",
      "isActive",
      "name",
      "price",
      "stock",
    ]);
  });

  it("never records cost or price values, nor before/after snapshots", async () => {
    await patch({ price: PRICE, cost: COST + 1 });

    const entry = auditEntry();
    expect(entry.before).toBeUndefined();
    expect(entry.after).toBeUndefined();
    const serialised = JSON.stringify(entry);
    for (const secret of [COST, COST + 1, PRICE, OLD_PRICE]) {
      expect(serialised).not.toContain(String(secret));
    }
    expect(Object.keys(entry.metadata.changedFields).sort()).toEqual(["cost", "price"]);
  });

  it("keeps the field names readable after the audit layer redacts the entry", async () => {
    // redactPii turns an array of strings under an unapproved key into
    // "[REDACTED]" entries; names must survive to be useful in a timeline.
    await patch({ price: PRICE, name: "Widget 2" });

    const persisted = redactPii(auditEntry().metadata);
    expect(Object.keys(persisted.changedFields).sort()).toEqual(["name", "price"]);
    expect(JSON.stringify(persisted)).not.toContain("REDACTED");
  });

  it("compares JSON columns in stored form so an unchanged image list is not reported", async () => {
    harness.findUnique.mockResolvedValue({ ...stored, images: JSON.stringify(["a.png"]) });
    await patch({ images: ["a.png"], name: "Widget 2" });
    expect(Object.keys(auditEntry().metadata.changedFields)).toEqual(["name"]);

    harness.logAudit.mockClear();
    await patch({ images: ["a.png", "b.png"] });
    expect(Object.keys(auditEntry().metadata.changedFields)).toEqual(["images"]);
  });

  it("writes no audit row when nothing differs", async () => {
    await patch({ name: "Widget", price: OLD_PRICE, cost: COST });
    expect(harness.logAudit).not.toHaveBeenCalled();
  });

  it("writes no audit row when the update itself fails", async () => {
    harness.update.mockRejectedValue(new Error("SKU already used"));
    await expect(patch({ price: PRICE })).rejects.toThrow("SKU already used");
    expect(harness.logAudit).not.toHaveBeenCalled();
  });

  it("writes no audit row and does not update when the cost permission is denied", async () => {
    harness.assertAction.mockImplementation((_: unknown, action: string) => {
      if (action === "products.cost.update") throw new Error("cost forbidden");
    });
    await expect(patch({ cost: COST + 1 })).rejects.toThrow("cost forbidden");
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.logAudit).not.toHaveBeenCalled();
  });

  it("still returns the projected product", async () => {
    const response = await patch({ price: PRICE });
    expect(harness.projectProduct).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });
});

describe("product route audit contract (source pin)", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/products/[id]/route.ts"),
    "utf8",
  );
  const patchStart = source.indexOf("export const PATCH");
  const deleteStart = source.indexOf("export const DELETE");
  const patchBlock = source.slice(patchStart, deleteStart);
  const deleteBlock = source.slice(deleteStart);

  it("locates both handlers", () => {
    expect(patchStart).toBeGreaterThan(0);
    expect(deleteStart).toBeGreaterThan(patchStart);
  });

  it("PATCH calls logAudit after the update, like DELETE does", () => {
    expect(patchBlock).toContain("await logAudit(");
    expect(patchBlock).toContain('action: "product.updated"');
    expect(patchBlock).toContain('entity: "product"');
    expect(patchBlock).toContain("entityId: id");
    expect(patchBlock).toContain("actor: trustedActorAuditIdentity(actorContext.actor)");
    expect(patchBlock.indexOf("productService.update(")).toBeLessThan(
      patchBlock.indexOf("await logAudit("),
    );
    // The DELETE audit is untouched.
    expect(deleteBlock).toContain('action: "product.deleted"');
  });

  it("PATCH audit entry carries no values: no before/after and no cost or price reference", () => {
    const callStart = patchBlock.indexOf("await logAudit(");
    const call = patchBlock.slice(callStart, patchBlock.indexOf("});", callStart));
    expect(call).not.toMatch(/\bbefore\s*:/);
    expect(call).not.toMatch(/\bafter\s*:/);
    expect(call).not.toMatch(/\.cost\b|\.price\b|\bcost\s*:|\bprice\s*:/);
    expect(call).toContain("changedFields");
  });
});
