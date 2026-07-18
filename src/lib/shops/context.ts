import "server-only";

import { basename } from "node:path";

export type ShopContext = Readonly<{
  shopId: string;
  registryRevision: number;
  databaseFileId: string;
  migrationSetSha256: string;
}>;

export function processShopContext(): ShopContext {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databasePath = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : "";
  const testing = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const development = process.env.NODE_ENV === "development";
  const packaged = process.env.NODE_ENV === "production";
  const fallbackShopId = !packaged && testing ? "test" : development ? "default" : "";
  const shopId = process.env.SF_ACTIVE_SHOP_ID ?? fallbackShopId;
  const registryRevision = Number.parseInt(
    process.env.SF_REGISTRY_REVISION ?? (!packaged && (testing || development) ? "1" : "0"),
    10,
  );
  const migrationSetSha256 =
    process.env.SF_MIGRATION_SET_SHA256 ??
    (!packaged && (testing || development) ? "0".repeat(64) : "");

  if (
    !shopId ||
    !Number.isSafeInteger(registryRevision) ||
    registryRevision < 1 ||
    !databasePath ||
    !/^[0-9a-f]{64}$/i.test(migrationSetSha256)
  ) {
    throw new Error("The process does not have a complete trusted ShopContext");
  }

  return Object.freeze({
    shopId,
    registryRevision,
    databaseFileId: basename(databasePath),
    migrationSetSha256,
  });
}
