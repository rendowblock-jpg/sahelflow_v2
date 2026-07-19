import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertTestSandbox,
  prepareTestSandbox,
} from "../scripts/test-sandbox";

const originalEnvironment = {
  SF_TEST_ROOT: process.env.SF_TEST_ROOT,
  SF_DATA_DIR: process.env.SF_DATA_DIR,
  DATABASE_URL: process.env.DATABASE_URL,
};

const cleanupPaths: string[] = [];

function restoreEnvironment(): void {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function createDirectoryLink(target: string, path: string): void {
  symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
}

afterEach(() => {
  restoreEnvironment();
  for (const path of cleanupPaths.splice(0).reverse()) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("test sandbox safety", () => {
  it("prepares and validates a normal sandbox below the OS temporary directory", () => {
    const fixture = mkdtempSync(join(tmpdir(), "sf-sandbox-test-"));
    cleanupPaths.push(fixture);
    const sandbox = prepareTestSandbox(join(fixture, "sandbox"));

    process.env.SF_TEST_ROOT = sandbox.root;
    process.env.SF_DATA_DIR = sandbox.dataDir;
    process.env.DATABASE_URL = sandbox.databaseUrl;

    expect(() => assertTestSandbox("test")).not.toThrow();
  });

  it("rejects a symlink or junction parent before creating the requested root", () => {
    const fixture = mkdtempSync(join(tmpdir(), "sf-sandbox-parent-"));
    cleanupPaths.push(fixture);
    const link = join(fixture, "outside-link");
    createDirectoryLink(process.cwd(), link);

    const escapedName = `sf-escaped-${process.pid}-${Date.now()}`;
    const escapedRoot = join(link, escapedName);
    const escapedTarget = join(process.cwd(), escapedName);
    cleanupPaths.push(escapedTarget, link);

    expect(() => prepareTestSandbox(escapedRoot)).toThrow(/symbolic link|junction|untrusted parent/i);
    expect(existsSync(escapedTarget)).toBe(false);
  });

  it("rejects a data directory that escapes through a symlink or junction", () => {
    const fixture = mkdtempSync(join(tmpdir(), "sf-sandbox-data-"));
    cleanupPaths.push(fixture);
    const sandbox = prepareTestSandbox(join(fixture, "sandbox"));
    rmSync(sandbox.dataDir, { recursive: true, force: true });
    createDirectoryLink(process.cwd(), sandbox.dataDir);
    cleanupPaths.push(sandbox.dataDir);

    process.env.SF_TEST_ROOT = sandbox.root;
    process.env.SF_DATA_DIR = sandbox.dataDir;
    process.env.DATABASE_URL = `file:${join(sandbox.dataDir, "escaped.db")}`;

    expect(() => assertTestSandbox("test")).toThrow(/symbolic link|junction|outside/i);
  });

  it("does not bless an existing non-empty directory without a sandbox marker", () => {
    const fixture = mkdtempSync(join(tmpdir(), "sf-sandbox-existing-"));
    cleanupPaths.push(fixture);
    const root = join(fixture, "important-data");
    mkdirSync(root);
    const sentinel = join(root, "keep.txt");
    writeFileSync(sentinel, "must survive\n");

    expect(() => prepareTestSandbox(root)).toThrow(/existing non-empty directory/i);
    expect(existsSync(sentinel)).toBe(true);
    expect(existsSync(join(root, ".sahelflow-test-sandbox"))).toBe(false);
  });

  it("does not bless an existing empty directory without a sandbox marker", () => {
    const fixture = mkdtempSync(join(tmpdir(), "sf-sandbox-empty-"));
    cleanupPaths.push(fixture);
    const root = join(fixture, "empty");
    mkdirSync(root);

    expect(() => prepareTestSandbox(root)).toThrow(/existing unmarked directory/i);
    expect(existsSync(join(root, ".sahelflow-test-sandbox"))).toBe(false);
  });
});
