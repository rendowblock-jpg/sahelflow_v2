/**
 * Prisma client factory + Customer PII encryption extension (ADR-003).
 *
 * Two exports:
 *   - `db`     — the extended client. Customer create/update/upsert/find* are
 *                transparently encrypted/decrypted. Use this everywhere in the
 *                app (call sites pass plaintext, get plaintext back).
 *   - `dbRaw`  — the unextended client. Use ONLY for the PII migration script
 *                (which reads plaintext + writes ciphertext directly) and for
 *                admin/debug queries that need to see the raw encrypted shape.
 *
 * ARCHITECTURE: One SQLite file per shop (max 10 shops). For development, a
 * single default client is used. SQLCipher is NOT used (Prisma's `?key=` param
 * is silently ignored — see ADR-003). Encryption is at the field level.
 */

import { PrismaClient } from "@prisma/client";
import {
  encryptCustomerData,
  decryptCustomerRow,
  rewriteCustomerWhere,
  ensurePhoneEncSelected,
} from "@/lib/crypto/customer-encryption";

const globalForPrisma = globalThis as unknown as {
  prisma: unknown;
  prismaRaw: PrismaClient | undefined;
  shopClients: Map<string, unknown> | undefined;
};

/** The raw, unextended Prisma client. Use for migration scripts only. */
export const dbRaw =
  globalForPrisma.prismaRaw ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaRaw = dbRaw;
}

/**
 * Apply the Customer PII encryption extension to a PrismaClient.
 *
 * Query interception:
 *   - create / update / upsert   → encrypt `data` before write
 *   - findMany / findUnique / findFirst → rewrite `where.phone` → blind index,
 *     ensure `phoneEnc` is selected, decrypt rows on read
 *   - createMany → encrypt each row (no row decryption — returns a count)
 *   - deleteMany → rewrite `where.phone` (no row decryption)
 *   - count / aggregate / delete → no interception (no PII in results)
 *
 * Edge cases handled:
 *   - Partial `select` that includes `phone` → auto-add `phoneEnc`, strip after.
 *   - Partial `update` (only some PII fields) → only those are encrypted.
 *   - Re-saving an already-encrypted row → idempotent (detects ciphertext shape).
 *   - Tampered ciphertext → decrypt fails silently (raw value preserved).
 */
function withPiiEncryption<T extends PrismaClient>(client: T) {
  return client.$extends({
    query: {
      customer: {
        // ── Write path ──────────────────────────────────────────────────
        async create({ args, query }) {
          if (args.data && typeof args.data === "object") {
            args.data = encryptCustomerData(
              args.data as Record<string, unknown>,
            ) as never;
          }
          const result = await query(args);
          return decryptCustomerRow(
            result as Record<string, unknown>,
          ) as never;
        },

        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) =>
              encryptCustomerData(d as Record<string, unknown>),
            ) as never;
          } else if (args.data && typeof args.data === "object") {
            args.data = encryptCustomerData(
              args.data as Record<string, unknown>,
            ) as never;
          }
          // createMany returns a count, not rows — no decryption needed
          return query(args);
        },

        async update({ args, query }) {
          if (args.data && typeof args.data === "object") {
            args.data = encryptCustomerData(
              args.data as Record<string, unknown>,
            ) as never;
          }
          const result = await query(args);
          return decryptCustomerRow(
            result as Record<string, unknown>,
          ) as never;
        },

        async upsert({ args, query }) {
          if (args.create && typeof args.create === "object") {
            args.create = encryptCustomerData(
              args.create as Record<string, unknown>,
            ) as never;
          }
          if (args.update && typeof args.update === "object") {
            args.update = encryptCustomerData(
              args.update as Record<string, unknown>,
            ) as never;
          }
          args.where = rewriteCustomerWhere(args.where) as never;
          const result = await query(args);
          return decryptCustomerRow(
            result as Record<string, unknown>,
          ) as never;
        },

        // ── Read path ───────────────────────────────────────────────────
        async findMany({ args, query }) {
          args.where = rewriteCustomerWhere(args.where) as never;
          const { select, include } = ensurePhoneEncSelected({
            select: args.select as Record<string, boolean> | undefined,
            include: args.include as Record<string, boolean> | undefined,
          });
          args.select = select as never;
          args.include = include as never;
          const result = (await query(args)) as unknown;
          if (Array.isArray(result)) {
            return result.map((r) =>
              decryptCustomerRow(r as Record<string, unknown>),
            ) as never;
          }
          return result as never;
        },

        async findUnique({ args, query }) {
          args.where = rewriteCustomerWhere(args.where) as never;
          const { select, include } = ensurePhoneEncSelected({
            select: args.select as Record<string, boolean> | undefined,
            include: args.include as Record<string, boolean> | undefined,
          });
          args.select = select as never;
          args.include = include as never;
          const result = await query(args);
          if (result === null) return null as never;
          return decryptCustomerRow(
            result as Record<string, unknown>,
          ) as never;
        },

        async findFirst({ args, query }) {
          args.where = rewriteCustomerWhere(args.where) as never;
          const { select, include } = ensurePhoneEncSelected({
            select: args.select as Record<string, boolean> | undefined,
            include: args.include as Record<string, boolean> | undefined,
          });
          args.select = select as never;
          args.include = include as never;
          const result = await query(args);
          if (result === null) return null as never;
          return decryptCustomerRow(
            result as Record<string, unknown>,
          ) as never;
        },

        // ── Delete path: rewrite where.phone (no row decryption needed) ─
        async delete({ args, query }) {
          args.where = rewriteCustomerWhere(args.where) as never;
          const result = await query(args);
          if (result === null) return null as never;
          return decryptCustomerRow(
            result as Record<string, unknown>,
          ) as never;
        },

        async deleteMany({ args, query }) {
          args.where = rewriteCustomerWhere(args.where) as never;
          return query(args);
        },
      },
    },
  });
}

/** The type of the extended Prisma client (used by ServiceContext). */
export type DbClient = ReturnType<typeof withPiiEncryption<PrismaClient>>;

/**
 * Default client (development / single-shop mode) — extended with PII encryption.
 * In production, use getShopClient(shopFilePath) instead.
 */
export const db = (globalForPrisma.prisma as DbClient | undefined) ??
  withPiiEncryption(dbRaw);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/**
 * Get an extended PrismaClient for a specific shop file.
 * Clients are cached by file path to avoid reconnection overhead.
 *
 * NOTE (ADR-003): the `encryptionKey` param is vestigial — Prisma's built-in
 * SQLite driver silently ignores the `?key=` connection param. SQLCipher is
 * not engaged. Field-level encryption (see src/lib/crypto/) protects sensitive
 * data instead. This param is kept for API stability; a future PR removes it.
 *
 * @param shopFilePath - Absolute path to the shop's SQLite file
 * @param _encryptionKey - Unused (vestigial). Encryption is field-level.
 */
export function getShopClient(
  shopFilePath: string,
  _encryptionKey?: string,
): DbClient {
  if (!globalForPrisma.shopClients) {
    globalForPrisma.shopClients = new Map();
  }

  const existing = globalForPrisma.shopClients.get(shopFilePath) as
    | DbClient
    | undefined;
  if (existing) return existing;

  const raw = new PrismaClient({
    datasourceUrl: `file:${shopFilePath}`,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  const extended = withPiiEncryption(raw);

  globalForPrisma.shopClients.set(shopFilePath, extended);
  return extended;
}

/** Disconnect all shop clients (called on app shutdown) */
export async function disconnectAllShops(): Promise<void> {
  if (globalForPrisma.shopClients) {
    await Promise.all(
      Array.from(globalForPrisma.shopClients.values()).map((c) =>
        (c as DbClient).$disconnect(),
      ),
    );
    globalForPrisma.shopClients.clear();
  }
  await dbRaw.$disconnect();
}
