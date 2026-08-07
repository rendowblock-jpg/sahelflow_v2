import "server-only";

import { basename } from "node:path";

import { assertMasterKeyRotationInactive } from "@/lib/maintenance/master-key-rotation";
import { assertProtectedDataMigrationInactive } from "@/lib/maintenance/protected-data-migration-lock";

export type ShopContext = Readonly<{
  workspaceId: string;
  installationId: string;
  shopId: string;
  shopIncarnationId: string;
  registryRevision: number;
  databaseFileId: string;
  migrationSetSha256: string;
}>;

const TEST_WORKSPACE_ID = "a".repeat(32);
const TEST_INSTALLATION_ID = "b".repeat(32);
const TEST_SHOP_INCARNATION_ID = "c".repeat(32);

export function processShopContext(): ShopContext {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const databasePath = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : "";
  // SF_TEST_ROOT is the immutable test-run authority. Focused suites may
  // intentionally change NODE_ENV or VITEST while the shared SQLite sandbox and
  // process-level Prisma cache remain alive, so those flags are only secondary.
  const testing =
    Boolean(process.env.SF_TEST_ROOT) ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true";
  const development = process.env.NODE_ENV === "development";
  const packaged = process.env.NODE_ENV === "production";

  if (packaged) {
    assertMasterKeyRotationInactive();
    assertProtectedDataMigrationInactive();
  }

  const fallbackShopId = testing ? "test" : development ? "default" : "";
  const shopId = process.env.SF_ACTIVE_SHOP_ID ?? fallbackShopId;
  const registryRevision = Number.parseInt(
    process.env.SF_REGISTRY_REVISION ?? (!packaged && (testing || development) ? "1" : "0"),
    10,
  );
  const migrationSetSha256 =
    process.env.SF_MIGRATION_SET_SHA256 ??
    (!packaged && (testing || development) ? "0".repeat(64) : "");
  const workspaceId =
    process.env.SF_WORKSPACE_ID ??
    (testing ? TEST_WORKSPACE_ID : development ? "0".repeat(32) : "");
  const installationId =
    process.env.SF_INSTALLATION_ID ??
    (testing ? TEST_INSTALLATION_ID : development ? "0".repeat(32) : "");
  const shopIncarnationId =
    process.env.SF_SHOP_INCARNATION_ID ??
    (testing ? TEST_SHOP_INCARNATION_ID : development ? "0".repeat(32) : "");
  const databaseFileId =
    process.env.SF_DATABASE_FILE_ID ??
    (!packaged && (testing || development) ? basename(databasePath) : "");

  if (
    !/^[0-9a-f]{32}$/i.test(workspaceId) ||
    !/^[0-9a-f]{32}$/i.test(installationId) ||
    !shopId ||
    !/^[0-9a-f]{32}$/i.test(shopIncarnationId) ||
    !Number.isSafeInteger(registryRevision) ||
    registryRevision < 1 ||
    !databasePath ||
    !databaseFileId ||
    databaseFileId !== basename(databasePath) ||
    !/^[0-9a-f]{64}$/i.test(migrationSetSha256)
  ) {
    throw new Error("The process does not have a complete trusted ShopContext");
  }

  return Object.freeze({
    workspaceId,
    installationId,
    shopId,
    shopIncarnationId,
    registryRevision,
    databaseFileId,
    migrationSetSha256,
  });
}
