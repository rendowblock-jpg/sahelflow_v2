import "server-only";

import { db, shopContext } from "@/lib/db";
import { loadBridgeConfig, loadBridgeTarget } from "./bridge-config";

/** Public projection of the bridge for the settings UI: never the URL, never the key. */
export async function bridgeState() {
  const context = { prisma: db, shop: shopContext };
  const [config, target] = await Promise.all([
    loadBridgeConfig(context),
    loadBridgeTarget(context),
  ]);
  return {
    connected: Boolean(target && config.spreadsheetId),
    config,
  };
}
