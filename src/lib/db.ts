/**
 * Prisma client factory.
 *
 * ARCHITECTURE: One SQLite file per shop (max 10 shops).
 * The app creates a separate PrismaClient instance per shop file path.
 * For development, a single default client is used.
 *
 * SQLCipher NOTE: Encryption is applied at the connection layer (Phase 0 item #5).
 * Currently uses plain SQLite. When SQLCipher is added, the connection string
 * will include the encryption key (derived from machine ID).
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  shopClients: Map<string, PrismaClient> | undefined;
};

/**
 * Default client (development / single-shop mode).
 * In production, use getShopClient(shopFilePath) instead.
 */
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/**
 * Get a PrismaClient for a specific shop file.
 * Clients are cached by file path to avoid reconnection overhead.
 *
 * @param shopFilePath - Absolute path to the shop's SQLite file
 * @param encryptionKey - SQLCipher key (Phase 0 item #5; undefined = no encryption)
 */
export function getShopClient(
  shopFilePath: string,
  encryptionKey?: string,
): PrismaClient {
  if (!globalForPrisma.shopClients) {
    globalForPrisma.shopClients = new Map();
  }

  const cacheKey = encryptionKey ? `${shopFilePath}:${encryptionKey}` : shopFilePath;
  const existing = globalForPrisma.shopClients.get(cacheKey);
  if (existing) return existing;

  const datasourceUrl = encryptionKey
    ? `file:${shopFilePath}?key=${encodeURIComponent(encryptionKey)}`
    : `file:${shopFilePath}`;

  const client = new PrismaClient({
    datasourceUrl,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  globalForPrisma.shopClients.set(cacheKey, client);
  return client;
}

/** Disconnect all shop clients (called on app shutdown) */
export async function disconnectAllShops(): Promise<void> {
  if (globalForPrisma.shopClients) {
    await Promise.all(
      Array.from(globalForPrisma.shopClients.values()).map((c) => c.$disconnect()),
    );
    globalForPrisma.shopClients.clear();
  }
  await db.$disconnect();
}
