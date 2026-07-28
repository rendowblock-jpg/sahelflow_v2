import { afterEach, describe, expect, it, vi } from "vitest";

import { db, shopContext } from "@/lib/db";
import { systemBusinessPrincipal } from "../principal";
import { assertBusinessCommandShopAuthority } from "../shop-authority";

afterEach(() => {
  vi.unstubAllEnvs();
});

function productionRuntime(): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VITEST", "false");
}

describe("business command shop authority", () => {
  it("rejects a client that is not the immutable process-bound client", () => {
    productionRuntime();

    try {
      assertBusinessCommandShopAuthority({
        prisma: {} as never,
        shop: shopContext,
        businessPrincipal: systemBusinessPrincipal("scheduler"),
      });
      throw new Error("expected shop authority rejection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "BUSINESS_COMMAND_SHOP_AUTHORITY",
        statusCode: 409,
      });
    }
  });

  it("rejects a ShopContext that differs from the process-selected authority", () => {
    productionRuntime();

    try {
      assertBusinessCommandShopAuthority({
        prisma: db,
        shop: {
          ...shopContext,
          shopId: `${shopContext.shopId}-stale`,
        },
        businessPrincipal: systemBusinessPrincipal("scheduler"),
      });
      throw new Error("expected shop context rejection");
    } catch (error) {
      expect(error).toMatchObject({
        code: "BUSINESS_COMMAND_SHOP_AUTHORITY",
        statusCode: 409,
      });
    }
  });
});
