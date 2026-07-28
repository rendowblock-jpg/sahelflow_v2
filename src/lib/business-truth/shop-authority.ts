import "server-only";

import { db, shopContext } from "@/lib/db";
import { assertProcessShopAuthority } from "@/lib/shops/authority";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import type { BusinessPrincipalContext } from "./principal";

const SHOP_CONTEXT_FIELDS = [
  "workspaceId",
  "installationId",
  "shopId",
  "shopIncarnationId",
  "registryRevision",
  "databaseFileId",
  "migrationSetSha256",
] as const satisfies readonly (keyof ShopContext)[];

function authorityError(message: string, statusCode = 409): SahelFlowError {
  return new SahelFlowError(
    message,
    "BUSINESS_COMMAND_SHOP_AUTHORITY",
    statusCode,
  );
}

function sameShopContext(left: ShopContext, right: ShopContext): boolean {
  return SHOP_CONTEXT_FIELDS.every((field) => left[field] === right[field]);
}

/**
 * Bind raw-SQL business commands to the exact process-selected shop client.
 *
 * Prisma's normal model-write extension protects the process client, but the
 * command kernel also uses `$queryRaw`/`$executeRaw`, and `getShopClient()` can
 * produce another extended client without the process authority guard. The
 * kernel therefore fails closed unless its client and ShopContext are the exact
 * process authority selected before server startup.
 */
export function assertBusinessCommandShopAuthority(
  context: BusinessPrincipalContext,
): void {
  const testing =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  if (testing) return;

  if (context.shop === undefined) {
    throw authorityError(
      "Canonical business commands require a trusted process ShopContext",
      500,
    );
  }
  if (context.prisma !== db) {
    throw authorityError(
      "Canonical business commands must use the immutable process-bound shop client",
    );
  }
  if (!sameShopContext(context.shop, shopContext)) {
    throw authorityError(
      "Canonical business command context does not match the process-selected shop",
    );
  }

  if (process.env.NODE_ENV === "production") {
    assertProcessShopAuthority(context.shop);
  }
}
