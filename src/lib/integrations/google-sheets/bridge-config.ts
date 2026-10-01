import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";

import type { ServiceContext } from "@/lib/data/service-base";
import { deleteSecret, getSecret, setSecret } from "@/lib/secrets";
import type { BridgeTarget } from "./bridge-client";

/**
 * Durable state of the Google Sheets bridge for the active shop.
 *
 *   secrets  google_sheets_bridge_url / _key   — encrypted, never returned
 *   setting  google_sheets_bridge              — non-secret configuration
 *   setting  google_sheets_bridge_pushed       — last status written per row
 */

export const BRIDGE_URL_SECRET = "google_sheets_bridge_url";
export const BRIDGE_KEY_SECRET = "google_sheets_bridge_key";
const CONFIG_SETTING = "google_sheets_bridge";
const PUSHED_SETTING = "google_sheets_bridge_pushed";

export const SHEET_FIELD_KEYS = [
  "orderNumber",
  "customerName",
  "phone",
  "wilaya",
  "commune",
  "address",
  "productName",
  "productSku",
  "variantName",
  "quantity",
  "deliveryCost",
  "notes",
] as const;
export type SheetFieldKey = (typeof SHEET_FIELD_KEYS)[number];

export const SYNC_INTERVALS = [2, 5, 15, 30] as const;
export const STATUS_LANGUAGES = ["ar", "fr", "en"] as const;

const resultSchema = z.object({
  at: z.string(),
  imported: z.number().int().nonnegative(),
  alreadyImported: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  pushed: z.number().int().nonnegative(),
  errors: z
    .array(z.object({ row: z.number().int(), message: z.string().max(300) }))
    .max(25),
  problem: z.string().max(300).nullable(),
});
export type SheetSyncResult = z.infer<typeof resultSchema>;

const configSchema = z.object({
  version: z.literal(1),
  spreadsheetId: z.string().max(200).nullable(),
  spreadsheetName: z.string().max(500).nullable(),
  sheet: z.string().max(200).nullable(),
  sheets: z.array(z.string().max(200)).max(200),
  headers: z.array(z.string().max(300)).max(200),
  /** sheet header → SahelFlow field */
  mapping: z.record(z.string().max(300), z.enum(SHEET_FIELD_KEYS)),
  /** folded sheet product text → exact catalog product name */
  productAliases: z.record(z.string().max(300), z.string().max(300)),
  autoImport: z.boolean(),
  intervalMinutes: z.union([z.literal(2), z.literal(5), z.literal(15), z.literal(30)]),
  writeBack: z.boolean(),
  statusLanguage: z.enum(STATUS_LANGUAGES),
  cursorRow: z.number().int().min(2),
  lastFullScanAt: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
  lastResult: resultSchema.nullable(),
});
export type SheetsBridgeConfig = z.infer<typeof configSchema>;

export function defaultBridgeConfig(): SheetsBridgeConfig {
  return {
    version: 1,
    spreadsheetId: null,
    spreadsheetName: null,
    sheet: null,
    sheets: [],
    headers: [],
    mapping: {},
    productAliases: {},
    autoImport: true,
    intervalMinutes: 5,
    writeBack: true,
    statusLanguage: "ar",
    cursorRow: 2,
    lastFullScanAt: null,
    lastSyncAt: null,
    lastResult: null,
  };
}

export async function loadBridgeConfig(context: ServiceContext): Promise<SheetsBridgeConfig> {
  const row = await context.prisma.setting.findUnique({ where: { key: CONFIG_SETTING } });
  if (!row) return defaultBridgeConfig();
  try {
    const parsed = configSchema.safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : defaultBridgeConfig();
  } catch {
    return defaultBridgeConfig();
  }
}

export async function saveBridgeConfig(
  context: ServiceContext,
  config: SheetsBridgeConfig,
): Promise<SheetsBridgeConfig> {
  const value = JSON.stringify(configSchema.parse(config));
  await context.prisma.setting.upsert({
    where: { key: CONFIG_SETTING },
    create: { key: CONFIG_SETTING, value },
    update: { value },
  });
  return config;
}

export async function loadPushedStatuses(context: ServiceContext): Promise<Record<string, string>> {
  const row = await context.prisma.setting.findUnique({ where: { key: PUSHED_SETTING } });
  if (!row) return {};
  try {
    const parsed = z.record(z.string(), z.string()).safeParse(JSON.parse(row.value));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function savePushedStatuses(
  context: ServiceContext,
  pushed: Record<string, string>,
): Promise<void> {
  const value = JSON.stringify(pushed);
  await context.prisma.setting.upsert({
    where: { key: PUSHED_SETTING },
    create: { key: PUSHED_SETTING, value },
    update: { value },
  });
}

/** The installation's bridge key, created once. It is embedded in the seller's script. */
export async function ensureBridgeKey(context: ServiceContext): Promise<string> {
  const existing = await getSecret(context, BRIDGE_KEY_SECRET);
  if (existing) return existing;
  const key = randomBytes(32).toString("base64url");
  await setSecret(context, BRIDGE_KEY_SECRET, key);
  return key;
}

export async function loadBridgeTarget(context: ServiceContext): Promise<BridgeTarget | null> {
  const [url, key] = await Promise.all([
    getSecret(context, BRIDGE_URL_SECRET),
    getSecret(context, BRIDGE_KEY_SECRET),
  ]);
  return url && key ? { url, key } : null;
}

export async function saveBridgeUrl(context: ServiceContext, url: string): Promise<void> {
  await setSecret(context, BRIDGE_URL_SECRET, url);
}

/** Disconnect: forget the URL, key, configuration and push memory. Orders stay. */
export async function forgetBridge(context: ServiceContext): Promise<void> {
  await Promise.all([
    deleteSecret(context, BRIDGE_URL_SECRET),
    deleteSecret(context, BRIDGE_KEY_SECRET),
    context.prisma.setting.deleteMany({ where: { key: { in: [CONFIG_SETTING, PUSHED_SETTING] } } }),
  ]);
}
