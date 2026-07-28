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
      SF_WORKSPACE_ID: "a".repeat(32),
      SF_INSTALLATION_ID: "b".repeat(32),
      SF_ACTIVE_SHOP_ID: "bundle-build",
      SF_SHOP_INCARNATION_ID: "c".repeat(32),
      SF_DATABASE_FILE_ID: "bundle-build.db",
      SF_REGISTRY_REVISION: "1",
      SF_MIGRATION_SET_SHA256: "0".repeat(64),
      SF_MIGRATION_STATUS: "ready",
    });

    const registry = JSON.parse(readFileSync(context.registryPath, "utf8")) as {
      formatVersion: number;
      revision: number;
      activeShopId: string;
      workspaceId: string;
      installationId: string;
      shops: Array<{ id: string; incarnationId: string; databaseFile: string }>;
    };
    expect(registry.formatVersion).toBe(2);
    expect(registry.revision).toBe(1);
    expect(registry.workspaceId).toBe("a".repeat(32));
    expect(registry.installationId).toBe("b".repeat(32));
    expect(registry.activeShopId).toBe("bundle-build");
    expect(registry.shops).toHaveLength(1);
    expect(registry.shops[0]).toMatchObject({
      id: "bundle-build",
      incarnationId: "c".repeat(32),
      databaseFile: "bundle-build.db",
    });
  });

  it("removes the disposable context idempotently", () => {
    const context = prepareDesktopBuildContext();
    expect(existsSync(context.root)).toBe(true);

    context.cleanup();
    context.cleanup();

    expect(existsSync(context.root)).toBe(false);
  });
});
