// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireTrustedAction: vi.fn(async (_action: string) => ({})),
  getById: vi.fn(),
  productFindMany: vi.fn(),
  settingFindMany: vi.fn(),
  settingFindUnique: vi.fn(),
}));
vi.mock("@/lib/identity/authorization", () => ({ requireTrustedAction: mocks.requireTrustedAction }));
vi.mock("@/lib/db", () => ({
  db: {
    product: { findMany: mocks.productFindMany },
    setting: { findMany: mocks.settingFindMany, findUnique: mocks.settingFindUnique, upsert: vi.fn() },
  },
  shopContext: { shopId: "shop 1" },
}));
vi.mock("@/lib/storefront/service", () => ({ storefrontService: { getById: mocks.getById } }));

import { GET } from "@/app/api/storefront/media/status/route";
import { hashPhoto } from "@/lib/storefront/media-host";
import { SahelFlowError } from "@/types/errors";

const cwd = mkdtempSync(join(tmpdir(), "w3a-route-"));
mkdirSync(join(cwd, "public", "uploads", "shop_1"), { recursive: true });
writeFileSync(join(cwd, "public", "uploads", "shop_1", "a.webp"), "route-photo");
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

const call = (query: string) => GET(new NextRequest(`http://localhost/api/storefront/media/status${query}`));

beforeEach(() => {
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  mocks.requireTrustedAction.mockClear();
  mocks.getById.mockResolvedValue({ id: "sf_1" });
  mocks.productFindMany.mockResolvedValue([{ id: "p1", images: "/uploads/shop_1/a.webp" }]);
  mocks.settingFindMany.mockResolvedValue([]);
  mocks.settingFindUnique.mockResolvedValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/storefront/media/status", () => {
  it("needs the same permission as reading the store, and checks it before anything else", async () => {
    mocks.requireTrustedAction.mockRejectedValueOnce(new SahelFlowError("no", "FORBIDDEN", 403));
    const response = await call("?storefrontId=sf_1");
    expect(response.status).toBe(403);
    expect(mocks.requireTrustedAction).toHaveBeenCalledWith("storefront.read");
    expect(mocks.productFindMany).not.toHaveBeenCalled();
  });

  it("refuses a missing or odd store id", async () => {
    for (const query of ["", "?storefrontId=", "?storefrontId=a%20b", "?storefrontId=../x"]) {
      expect((await call(query)).status, query).toBe(400);
    }
    expect(mocks.getById).not.toHaveBeenCalled();
  });

  it("answers 404 for a store this shop does not have", async () => {
    mocks.getById.mockResolvedValueOnce(null);
    expect((await call("?storefrontId=sf_1")).status).toBe(404);
  });

  it("reports hosted from the ledger, with no hash and no file path in the answer", async () => {
    const hash = hashPhoto(Buffer.from("route-photo"));
    mocks.settingFindMany.mockResolvedValue([{ key: `storefront.media.sf_1.${hash}`, value: JSON.stringify({ state: "hosted", at: "2026-10-31T10:00:00.000Z" }) }]);
    const response = await call("?storefrontId=sf_1");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ products: { p1: [{ ref: "/uploads/shop_1/a.webp", state: "hosted" }] }, progress: null });
    expect(text).not.toContain(hash);
    expect(text).not.toContain(cwd);
  });

  it("reports 'only on this PC' when the ledger knows nothing", async () => {
    const body = await (await call("?storefrontId=sf_1")).json() as { products: Record<string, Array<{ state: string }>> };
    expect(body.products.p1?.[0]?.state).toBe("local-only");
  });
});
