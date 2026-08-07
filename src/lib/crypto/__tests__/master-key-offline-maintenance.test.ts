import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  _resetMasterKeyCacheForTests,
  getMasterKey,
} from "@/lib/crypto/master-key";

const EXPORTED_ROOT_ENV = "SF_PROTECTED_DATA_MIGRATION_ROOT_SOURCE";
const originalArgv = [...process.argv];
const originalEnvironment = {
  SF_DATA_DIR: process.env.SF_DATA_DIR,
  SF_INSTALLATION_ROOT_SOURCE: process.env.SF_INSTALLATION_ROOT_SOURCE,
  SF_MASTER_KEY: process.env.SF_MASTER_KEY,
  exportedRoot: process.env[EXPORTED_ROOT_ENV],
};
let sandbox = "";
let dataDir = "";

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function expectCode(expected: string) {
  try {
    getMasterKey();
    throw new Error("Expected offline maintenance root acquisition to fail");
  } catch (error) {
    expect(error).toMatchObject({ code: expected });
  }
}

describe("offline protected-data maintenance root authority", () => {
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), "sahelflow-offline-root-"));
    dataDir = join(sandbox, "installed-app-data");
    process.argv = [
      originalArgv[0] ?? "bun",
      join(sandbox, "migrate-protected-data-v1.ts"),
      "--verify",
    ];
    process.env.SF_DATA_DIR = dataDir;
    delete process.env.SF_INSTALLATION_ROOT_SOURCE;
    delete process.env.SF_MASTER_KEY;
    delete process.env[EXPORTED_ROOT_ENV];
    _resetMasterKeyCacheForTests();
  });

  afterEach(() => {
    _resetMasterKeyCacheForTests();
    process.argv = [...originalArgv];
    restoreEnvironment("SF_DATA_DIR", originalEnvironment.SF_DATA_DIR);
    restoreEnvironment(
      "SF_INSTALLATION_ROOT_SOURCE",
      originalEnvironment.SF_INSTALLATION_ROOT_SOURCE,
    );
    restoreEnvironment("SF_MASTER_KEY", originalEnvironment.SF_MASTER_KEY);
    restoreEnvironment(EXPORTED_ROOT_ENV, originalEnvironment.exportedRoot);
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("fails closed without creating a compatibility master.key", () => {
    expectCode("PROTECTED_DATA_MIGRATION_ROOT_REQUIRED");

    expect(existsSync(join(dataDir, "master.key"))).toBe(false);
    expect(existsSync(dataDir)).toBe(false);
  });

  it("rejects a missing explicit export without touching installed AppData", () => {
    process.env[EXPORTED_ROOT_ENV] = join(sandbox, "missing-root.txt");

    expectCode("PROTECTED_DATA_MIGRATION_ROOT_UNAVAILABLE");
    expect(existsSync(join(dataDir, "master.key"))).toBe(false);
    expect(existsSync(dataDir)).toBe(false);
  });

  it("uses only the explicit exported root and never persists it", () => {
    const exportDir = join(sandbox, "handoff");
    const exportPath = join(exportDir, "installation-root.txt");
    const expected = "ab".repeat(32);
    mkdirSync(exportDir, { recursive: true });
    writeFileSync(exportPath, `${expected}\n`, { mode: 0o600 });
    process.env[EXPORTED_ROOT_ENV] = exportPath;

    const resolved = getMasterKey();

    expect(resolved.toString("hex")).toBe(expected);
    expect(existsSync(join(dataDir, "master.key"))).toBe(false);
    expect(existsSync(dataDir)).toBe(false);
  });
});
