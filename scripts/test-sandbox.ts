import {
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

export const TEST_SANDBOX_MARKER = ".sahelflow-test-sandbox";

function normalized(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child !== "" && !child.startsWith("..") && !isAbsolute(child);
}

function isWithinOrEqual(root: string, candidate: string): boolean {
  return normalized(root) === normalized(candidate) || isWithin(root, candidate);
}

function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function nearestExistingAncestor(path: string): string {
  let current = resolve(path);
  while (!pathExists(current)) {
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(`[safety] no existing ancestor for ${path}`);
    }
    current = parent;
  }
  return current;
}

function assertNoLinkComponents(base: string, candidate: string, label: string): void {
  const child = relative(base, candidate);
  if (child === "" || child.startsWith("..") || isAbsolute(child)) {
    throw new Error(`[safety] ${label} is outside its trusted parent`);
  }

  let current = resolve(base);
  for (const part of child.split(sep)) {
    current = join(current, part);
    if (!pathExists(current)) break;
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`[safety] ${label} cannot traverse a symbolic link or junction`);
    }
  }
}

function assertContainedPath(
  lexicalRoot: string,
  actualRoot: string,
  candidate: string,
  label: string,
): void {
  if (!isWithin(lexicalRoot, candidate)) {
    throw new Error(`[safety] ${label} must remain below its trusted root`);
  }

  assertNoLinkComponents(lexicalRoot, candidate, label);
  const actualAncestor = realpathSync.native(nearestExistingAncestor(candidate));
  if (!isWithinOrEqual(actualRoot, actualAncestor)) {
    throw new Error(`[safety] ${label} resolves outside its trusted root`);
  }
}

function assertRegularMarker(root: string, marker: string, label: string): void {
  if (!pathExists(marker)) {
    throw new Error(
      `[safety] ${label} sandbox marker is missing; run bun run test:sandbox -- <temporary-root>`,
    );
  }

  const markerStat = lstatSync(marker);
  if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
    throw new Error(`[safety] ${label} sandbox marker must be a regular file`);
  }
  if (!isWithin(root, realpathSync.native(marker))) {
    throw new Error(`[safety] ${label} sandbox marker resolves outside SF_TEST_ROOT`);
  }
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

  if (!pathExists(root) || !lstatSync(root).isDirectory()) {
    throw new Error(`[safety] ${label} sandbox root is missing or is not a directory`);
  }

  const tempRoot = resolve(tmpdir());
  const actualTempRoot = realpathSync.native(tempRoot);
  assertNoLinkComponents(tempRoot, root, `${label} sandbox root`);
  const actualRoot = realpathSync.native(root);
  if (!isWithin(actualTempRoot, actualRoot)) {
    throw new Error(`[safety] ${label} sandbox must be below the OS temporary directory`);
  }

  assertContainedPath(root, actualRoot, dataDir, `${label} data directory`);
  if (!pathExists(dataDir) || !lstatSync(dataDir).isDirectory()) {
    throw new Error(`[safety] ${label} data directory is missing or is not a directory`);
  }
  assertContainedPath(root, actualRoot, dbPath, `${label} database path`);

  const marker = resolve(root, TEST_SANDBOX_MARKER);
  assertRegularMarker(actualRoot, marker, label);
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
  const tempRoot = resolve(tmpdir());
  const actualTempRoot = realpathSync.native(tempRoot);
  if (!isWithin(tempRoot, root)) {
    throw new Error("Refusing to create a test sandbox outside the OS temporary directory");
  }

  const parent = dirname(root);
  if (normalized(parent) !== normalized(tempRoot)) {
    assertNoLinkComponents(tempRoot, parent, "test sandbox parent");
  }
  const actualParent = realpathSync.native(nearestExistingAncestor(parent));
  if (!isWithinOrEqual(actualTempRoot, actualParent)) {
    throw new Error("Refusing to create a test sandbox through an untrusted parent");
  }

  const rootExisted = pathExists(root);
  if (rootExisted) {
    assertNoLinkComponents(tempRoot, root, "test sandbox root");
    if (!lstatSync(root).isDirectory()) {
      throw new Error("Refusing to use a test sandbox root that is not a directory");
    }
  }

  mkdirSync(root, { recursive: true });
  const actualRoot = realpathSync.native(root);
  if (!isWithin(actualTempRoot, actualRoot)) {
    throw new Error("Refusing to create a test sandbox outside the OS temporary directory");
  }

  const marker = resolve(root, TEST_SANDBOX_MARKER);
  if (rootExisted && !pathExists(marker)) {
    const state = readdirSync(root).length > 0 ? "non-empty" : "unmarked";
    throw new Error(
      `Refusing to mark an existing ${state} directory as a disposable test sandbox`,
    );
  }
  if (!pathExists(marker)) {
    writeFileSync(marker, "SahelFlow disposable test sandbox. No seller data.\n", {
      flag: "wx",
    });
  }
  assertRegularMarker(actualRoot, marker, "test sandbox");

  const dataDir = resolve(root, "data");
  const dbPath = resolve(dataDir, "shops", "test.db");
  assertContainedPath(root, actualRoot, dataDir, "test sandbox data directory");
  mkdirSync(dataDir, { recursive: true });
  assertContainedPath(root, actualRoot, dataDir, "test sandbox data directory");

  const dbParent = dirname(dbPath);
  assertContainedPath(root, actualRoot, dbParent, "test sandbox database parent");
  mkdirSync(dbParent, { recursive: true });
  assertContainedPath(root, actualRoot, dbParent, "test sandbox database parent");

  return { root, dataDir, databaseUrl: `file:${dbPath}` };
}
