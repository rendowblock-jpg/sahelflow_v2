import "server-only";

import { readFileSync } from "node:fs";
import { SahelFlowError } from "@/types/errors";
import type { ShopContext } from "./context";
import { registryPath } from "./paths";

type RegistryAuthority = {
  formatVersion: 2;
  workspaceId: string;
  installationId: string;
  revision: number;
  activeShopId: string;
  shops: Array<{ id: string; incarnationId: string; databaseFile: string }>;
};

function unavailableRegistry(): SahelFlowError {
  return new SahelFlowError(
    "The canonical shop registry is unavailable; restart SahelFlow to recover safely",
    "SHOP_REGISTRY_UNAVAILABLE",
    503,
  );
}

function parseRegistryAuthority(value: unknown): RegistryAuthority {
  if (!value || typeof value !== "object") throw unavailableRegistry();
  const registry = value as Partial<RegistryAuthority>;
  if (
    registry.formatVersion !== 2 ||
    !Number.isSafeInteger(registry.revision) ||
    (registry.revision ?? 0) < 1 ||
    typeof registry.workspaceId !== "string" ||
    !/^[0-9a-f]{32}$/i.test(registry.workspaceId) ||
    typeof registry.installationId !== "string" ||
    !/^[0-9a-f]{32}$/i.test(registry.installationId) ||
    typeof registry.activeShopId !== "string" ||
    !Array.isArray(registry.shops)
  ) {
    throw unavailableRegistry();
  }

  const shops = registry.shops.filter(
    (shop): shop is { id: string; incarnationId: string; databaseFile: string } =>
      !!shop &&
      typeof shop.id === "string" &&
      typeof shop.incarnationId === "string" &&
      /^[0-9a-f]{32}$/i.test(shop.incarnationId) &&
      typeof shop.databaseFile === "string",
  );
  if (shops.length !== registry.shops.length) throw unavailableRegistry();

  return {
    formatVersion: 2,
    workspaceId: registry.workspaceId,
    installationId: registry.installationId,
    revision: registry.revision!,
    activeShopId: registry.activeShopId,
    shops,
  };
}

export function assertShopAuthorityMatches(
  context: ShopContext,
  value: unknown,
): void {
  const registry = parseRegistryAuthority(value);
  const activeShop = registry.shops.find((shop) => shop.id === registry.activeShopId);
  if (
    registry.revision !== context.registryRevision ||
    registry.workspaceId !== context.workspaceId ||
    registry.installationId !== context.installationId ||
    registry.activeShopId !== context.shopId ||
    activeShop?.incarnationId !== context.shopIncarnationId ||
    activeShop?.databaseFile !== context.databaseFileId
  ) {
    throw new SahelFlowError(
      "The running process no longer owns the active shop; restart SahelFlow before continuing",
      "SHOP_CONTEXT_STALE",
      409,
    );
  }
}

export function assertProcessShopAuthority(context: ShopContext): void {
  let registry: unknown;
  try {
    registry = JSON.parse(readFileSync(registryPath, "utf8"));
  } catch {
    throw unavailableRegistry();
  }
  assertShopAuthorityMatches(context, registry);
}
