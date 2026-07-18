import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

export const TEST_SANDBOX_MARKER = ".sahelflow-test-sandbox";

function normalized(path: string): string {
  return resolve(path).toLowerCase();
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
}

function databasePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use an absolute file: SQLite URL");
  }

  const path = decodeURIComponent(databaseUrl.slice("file:".length));
  if (!isAbsolute(path)) {
    throw new Error("DATABASE_URL must point to an absolute SQLite path");
  }
  return resolve(path);
}

export function assertTestSandbox(label: string): void {
  const rootValue = process.env.SF_TEST_ROOT;
  const dataValue = process.env.SF_DATA_DIR;
  const databaseUrl = process.env.DATABASE_URL;

  if (!rootValue || !dataValue || !databaseUrl) {
    throw new Error(
      `[safety] ${label} requires SF_TEST_ROOT, SF_DATA_DIR, and DATABASE_URL`,
    );
  }

  if (!isAbsolute(rootValue) || !isAbsolute(dataValue)) {
    throw new Error(`[safety] ${label} requires absolute sandbox paths`);
  }

  const root = resolve(rootValue);
  const dataDir = resolve(dataValue);
  const dbPath = databasePath(databaseUrl);
  const repositoryData = resolve(process.cwd(), "data");

  if (normalized(root) === normalized(repositoryData)) {
    throw new Error(`[safety] ${label} cannot use the repository data directory`);
  }
  if (!isWithin(root, dataDir) || !isWithin(root, dbPath)) {
    throw new Error(`[safety] ${label} paths must remain below SF_TEST_ROOT`);
  }

  const marker = resolve(root, TEST_SANDBOX_MARKER);
  if (!existsSync(marker)) {
    throw new Error(
      `[safety] ${label} sandbox marker is missing; run bun run test:sandbox -- <temporary-root>`,
    );
  }

  const actualRoot = realpathSync(root);
  const tempRoot = realpathSync(tmpdir());
  if (!isWithin(tempRoot, actualRoot)) {
    throw new Error(`[safety] ${label} sandbox must be below the OS temporary directory`);
  }
}

export function prepareTestSandbox(rootValue: string): {
  root: string;
  dataDir: string;
  databaseUrl: string;
} {
  if (!rootValue || !isAbsolute(rootValue)) {
    throw new Error("Provide an absolute sandbox root below the OS temporary directory");
  }

  const root = resolve(rootValue);
  const tempRoot = realpathSync(tmpdir());
  mkdirSync(root, { recursive: true });
  const actualRoot = realpathSync(root);
  if (!isWithin(tempRoot, actualRoot)) {
    throw new Error("Refusing to create a test sandbox outside the OS temporary directory");
  }

  const dataDir = resolve(root, "data");
  const dbPath = resolve(root, "data", "shops", "test.db");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(resolve(dbPath, ".."), { recursive: true });
  const marker = resolve(root, TEST_SANDBOX_MARKER);
  if (!existsSync(marker)) {
    writeFileSync(marker, "SahelFlow disposable test sandbox. No seller data.\n", {
      flag: "wx",
    });
  }

  return { root, dataDir, databaseUrl: `file:${dbPath}` };
}
