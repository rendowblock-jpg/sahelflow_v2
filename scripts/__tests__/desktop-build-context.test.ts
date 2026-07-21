import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareDesktopBuildContext,
  type DesktopBuildContext,
} from "../desktop-build-context";

const contexts: DesktopBuildContext[] = [];

afterEach(() => {
  while (contexts.length > 0) contexts.pop()?.cleanup();
});

describe("desktop build ShopContext", () => {
  it("creates a complete isolated authority tuple below the OS temp directory", () => {
    const context = prepareDesktopBuildContext();
    contexts.push(context);

    expect(isAbsolute(context.root)).toBe(true);
    expect(isAbsolute(context.dataDir)).toBe(true);
    expect(isAbsolute(context.databasePath)).toBe(true);
    expect(relative(resolve(tmpdir()), context.root)).not.toMatch(/^\.\./);
    expect(existsSync(context.databasePath)).toBe(true);
    expect(existsSync(context.registryPath)).toBe(true);

    expect(context.env).toEqual({
      DATABASE_URL: `file:${context.databasePath}`,
      SF_DATA_DIR: context.dataDir,
      SF_ACTIVE_SHOP_ID: "bundle-build",
      SF_REGISTRY_REVISION: "1",
      SF_MIGRATION_SET_SHA256: "0".repeat(64),
      SF_MIGRATION_STATUS: "ready",
    });

    const registry = JSON.parse(readFileSync(context.registryPath, "utf8")) as {
      formatVersion: number;
      revision: number;
      activeShopId: string;
      shops: Array<{ id: string; databaseFile: string }>;
    };
    expect(registry.formatVersion).toBe(1);
    expect(registry.revision).toBe(1);
    expect(registry.activeShopId).toBe("bundle-build");
    expect(registry.shops).toEqual([
      { id: "bundle-build", databaseFile: "bundle-build.db" },
    ]);
  });

  it("removes the disposable context idempotently", () => {
    const context = prepareDesktopBuildContext();
    expect(existsSync(context.root)).toBe(true);

    context.cleanup();
    context.cleanup();

    expect(existsSync(context.root)).toBe(false);
  });
});
