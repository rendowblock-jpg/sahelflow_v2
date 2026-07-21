import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BUILD_SHOP_ID = "bundle-build";
const BUILD_DATABASE_FILE = `${BUILD_SHOP_ID}.db`;
const BUILD_REGISTRY_REVISION = 1;
const BUILD_MIGRATION_SET_SHA256 = "0".repeat(64);

export type DesktopBuildContext = Readonly<{
  root: string;
  dataDir: string;
  databasePath: string;
  registryPath: string;
  env: Readonly<Record<string, string>>;
  cleanup: () => void;
}>;

/**
 * Create the complete, disposable server authority tuple required while Next.js
 * imports route modules during `next build`.
 *
 * This context is build-only and lives below the OS temporary directory. It is
 * never packaged as seller data. The installed server receives its real
 * ShopContext from the Tauri runtime supervisor on every launch.
 */
export function prepareDesktopBuildContext(): DesktopBuildContext {
  const root = mkdtempSync(resolve(tmpdir(), "sahelflow-desktop-build-"));
  const dataDir = resolve(root, "data");
  const databasePath = resolve(dataDir, "shops", BUILD_DATABASE_FILE);
  const registryPath = resolve(dataDir, "shop-registry.json");

  mkdirSync(dirname(databasePath), { recursive: true });
  writeFileSync(databasePath, "", { flag: "wx" });
  writeFileSync(
    registryPath,
    `${JSON.stringify(
      {
        formatVersion: 1,
        revision: BUILD_REGISTRY_REVISION,
        installationId: "desktop-bundle-build",
        activeShopId: BUILD_SHOP_ID,
        shops: [
          {
            id: BUILD_SHOP_ID,
            name: "Desktop Bundle Build",
            databaseFile: BUILD_DATABASE_FILE,
            icon: null,
            createdAt: "1970-01-01T00:00:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );

  let cleaned = false;
  return Object.freeze({
    root,
    dataDir,
    databasePath,
    registryPath,
    env: Object.freeze({
      DATABASE_URL: `file:${databasePath}`,
      SF_DATA_DIR: dataDir,
      SF_ACTIVE_SHOP_ID: BUILD_SHOP_ID,
      SF_REGISTRY_REVISION: String(BUILD_REGISTRY_REVISION),
      SF_MIGRATION_SET_SHA256: BUILD_MIGRATION_SET_SHA256,
      SF_MIGRATION_STATUS: "ready",
    }),
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      rmSync(root, { recursive: true, force: true });
    },
  });
}
