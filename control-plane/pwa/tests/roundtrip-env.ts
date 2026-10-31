// A test-owned SQLite database for the round-trip test files. The shared sandbox database holds a protected-key authority row sealed
// under the shop "test", and the relay refuses a shop id under 8 characters, so the round trip runs on its OWN file under a shop id
// the relay accepts. Call roundtripEnv() inside `await vi.hoisted(async () => ...)`, BEFORE anything imports @/lib/db.
// Nothing here touches the shared sandbox: it only points this test process's environment at a fresh folder, and dispose() puts the
// environment back and removes the folder.
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { prepareTestSandbox } from "../../../scripts/test-sandbox";

export const RT_SHOP_ID = "testshop0001";
const KEYS = ["SF_TEST_ROOT", "SF_DATA_DIR", "DATABASE_URL", "SF_ACTIVE_SHOP_ID"] as const;

export interface RoundtripEnv { root: string; databasePath: string; dispose: () => void }

export function roundtripEnv(): RoundtripEnv {
  const before = KEYS.map((k) => [k, process.env[k]] as const);
  // The file name stays test.db: context.ts requires databaseFileId == basename(databasePath).
  const sandbox = prepareTestSandbox(join(tmpdir(), `sf-rt-${randomBytes(6).toString("hex")}`));
  const databasePath = join(sandbox.dataDir, "shops", "test.db");
  const migrations = fileURLToPath(new URL("../../../prisma/migrations/", import.meta.url));
  const sqlite = new DatabaseSync(databasePath);
  let name = "";
  try {
    for (name of readdirSync(migrations).sort()) {
      const file = join(migrations, name, "migration.sql");
      if (existsSync(file)) sqlite.exec(readFileSync(file, "utf8"));
    }
  } catch (cause) {
    sqlite.close(); rmSync(sandbox.root, { recursive: true, force: true });
    throw new Error(`roundtrip-env: migration ${name} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  sqlite.close();
  process.env.SF_TEST_ROOT = sandbox.root; process.env.SF_DATA_DIR = sandbox.dataDir;
  process.env.DATABASE_URL = `file:${databasePath}`; process.env.SF_ACTIVE_SHOP_ID = RT_SHOP_ID;
  return {
    root: sandbox.root, databasePath,
    dispose: () => {
      for (const [k, v] of before) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      rmSync(sandbox.root, { recursive: true, force: true });
    },
  };
}
