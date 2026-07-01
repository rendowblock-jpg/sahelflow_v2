/**
 * Prisma client factory + transparent PII encryption extension (ADR-003).
 *
 * Two exports:
 *   - `db`     — the extended client. PII fields on Customer, Order, and
 *                Conversation are transparently encrypted/decrypted. Use this
 *                everywhere in the app (call sites pass plaintext, get
 *                plaintext back).
 *   - `dbRaw`  — the unextended client. Use ONLY for the PII migration script
 *                (which reads plaintext + writes ciphertext directly) and for
 *                admin/debug queries that need to see the raw encrypted shape.
 *
 * ARCHITECTURE: One SQLite file per shop (max 10 shops). For development, a
 * single default client is used. SQLCipher is NOT used (Prisma's `?key=` param
 * is silently ignored — see ADR-003). Encryption is at the field level.
 *
 * PII coverage:
 *   - Customer (searchable phone): blind-index + companion ciphertext pattern
 *     (see src/lib/crypto/customer-encryption.ts)
 *   - Order (phone, address, notes — non-searchable): in-place ciphertext
 *     (see src/lib/crypto/pii-fields.ts)
 *   - Conversation (contactName, contactPhone — non-searchable): in-place
 *     ciphertext (see src/lib/crypto/pii-fields.ts)
 */
import "server-only";


import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  encryptCustomerData,
  decryptCustomerRow,
  rewriteCustomerWhere,
  ensurePhoneEncSelected,
} from "@/lib/crypto/customer-encryption";
import {
  encryptPiiFields,
  decryptPiiRow,
  ORDER_PII_FIELDS,
  CONVERSATION_PII_FIELDS,
  MESSAGE_PII_FIELDS,
} from "@/lib/crypto/pii-fields";
import { decryptNestedPii, ensureNestedCustomerPhoneEnc } from "@/lib/crypto/nested";

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
  // Helpers: decrypt the row's own PII, then walk the result for nested
  // relations (which Prisma's $extends query callbacks don't intercept —
  // verified by src/lib/__tests__/pii-nested-includes.test.ts). Without
  // this, `db.order.findUnique({ include: { customer: true } })` returns
  // the nested customer with ciphertext name + blind-index phone (D-001).
  const decryptOrderResult = (row: Record<string, unknown>) =>
    decryptNestedPii(decryptPiiRow(row, ORDER_PII_FIELDS));
  const decryptConversationResult = (row: Record<string, unknown>) =>
    decryptNestedPii(decryptPiiRow(row, CONVERSATION_PII_FIELDS));
  const decryptCustomerResult = (row: Record<string, unknown>) =>
    decryptNestedPii(decryptCustomerRow(row));
  const decryptMessageResult = (row: Record<string, unknown>) =>
    decryptNestedPii(decryptPiiRow(row, MESSAGE_PII_FIELDS));

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
          return decryptCustomerResult(result as Record<string, unknown>) as never;
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
          return decryptCustomerResult(result as Record<string, unknown>) as never;
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
          return decryptCustomerResult(result as Record<string, unknown>) as never;
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
              decryptCustomerResult(r as Record<string, unknown>),
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
          return decryptCustomerResult(result as Record<string, unknown>) as never;
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
          return decryptCustomerResult(result as Record<string, unknown>) as never;
        },

        // ── Delete path: rewrite where.phone (no row decryption needed) ─
        async delete({ args, query }) {
          args.where = rewriteCustomerWhere(args.where) as never;
          const result = await query(args);
          if (result === null) return null as never;
          return decryptCustomerResult(result as Record<string, unknown>) as never;
        },

        async deleteMany({ args, query }) {
          args.where = rewriteCustomerWhere(args.where) as never;
          return query(args);
        },
      },

      // ─────────────────────────────────────────────────────────────────────
      // Order: non-searchable PII (phone, address, notes) — in-place encrypt
      // ─────────────────────────────────────────────────────────────────────
      order: {
        async create({ args, query }) {
          if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              ORDER_PII_FIELDS,
            ) as never;
          }
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          return decryptOrderResult(result as Record<string, unknown>) as never;
        },

        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) =>
              encryptPiiFields(d as Record<string, unknown>, ORDER_PII_FIELDS, undefined, { sourceField: "phone", indexField: "phoneBlindIndex" }),
            ) as never;
          } else if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              ORDER_PII_FIELDS,
            ) as never;
          }
          // createMany returns a count — no row decryption needed
          return query(args);
        },

        async update({ args, query }) {
          if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              ORDER_PII_FIELDS,
            ) as never;
          }
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          return decryptOrderResult(result as Record<string, unknown>) as never;
        },

        async upsert({ args, query }) {
          if (args.create && typeof args.create === "object") {
            args.create = encryptPiiFields(
              args.create as Record<string, unknown>,
              ORDER_PII_FIELDS,
            ) as never;
          }
          if (args.update && typeof args.update === "object") {
            args.update = encryptPiiFields(
              args.update as Record<string, unknown>,
              ORDER_PII_FIELDS,
            ) as never;
          }
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          return decryptOrderResult(result as Record<string, unknown>) as never;
        },

        async findMany({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = (await query(args)) as unknown;
          if (Array.isArray(result)) {
            return result.map((r) =>
              decryptOrderResult(r as Record<string, unknown>),
            ) as never;
          }
          return result as never;
        },

        async findUnique({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptOrderResult(result as Record<string, unknown>) as never;
        },

        async findFirst({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptOrderResult(result as Record<string, unknown>) as never;
        },

        async delete({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptOrderResult(result as Record<string, unknown>) as never;
        },

        // deleteMany + count + aggregate: no PII in results — no interception
      },

      // ─────────────────────────────────────────────────────────────────────
      // Conversation: non-searchable PII (contactName, contactPhone) — in-place
      // ─────────────────────────────────────────────────────────────────────
      conversation: {
        async create({ args, query }) {
          if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              CONVERSATION_PII_FIELDS,
            ) as never;
          }
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          return decryptConversationResult(result as Record<string, unknown>) as never;
        },

        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) =>
              encryptPiiFields(
                d as Record<string, unknown>,
                CONVERSATION_PII_FIELDS,
              ),
            ) as never;
          } else if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              CONVERSATION_PII_FIELDS,
            ) as never;
          }
          return query(args);
        },

        async update({ args, query }) {
          if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              CONVERSATION_PII_FIELDS,
            ) as never;
          }
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          return decryptConversationResult(result as Record<string, unknown>) as never;
        },

        async upsert({ args, query }) {
          if (args.create && typeof args.create === "object") {
            args.create = encryptPiiFields(
              args.create as Record<string, unknown>,
              CONVERSATION_PII_FIELDS,
            ) as never;
          }
          if (args.update && typeof args.update === "object") {
            args.update = encryptPiiFields(
              args.update as Record<string, unknown>,
              CONVERSATION_PII_FIELDS,
            ) as never;
          }
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          return decryptConversationResult(result as Record<string, unknown>) as never;
        },

        async findMany({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = (await query(args)) as unknown;
          if (Array.isArray(result)) {
            return result.map((r) =>
              decryptConversationResult(r as Record<string, unknown>),
            ) as never;
          }
          return result as never;
        },

        async findUnique({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptConversationResult(result as Record<string, unknown>) as never;
        },

        async findFirst({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptConversationResult(result as Record<string, unknown>) as never;
        },

        async delete({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptConversationResult(result as Record<string, unknown>) as never;
        },
      },

      message: {
        async create({ args, query }) {
          if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              MESSAGE_PII_FIELDS,
            ) as never;
          }
          const result = await query(args);
          return decryptMessageResult(result as Record<string, unknown>) as never;
        },
        async createMany({ args, query }) {
          if (Array.isArray(args.data)) {
            args.data = args.data.map((d) =>
              encryptPiiFields(d as Record<string, unknown>, MESSAGE_PII_FIELDS),
            ) as never;
          } else if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              MESSAGE_PII_FIELDS,
            ) as never;
          }
          return query(args);
        },
        async update({ args, query }) {
          if (args.data && typeof args.data === "object") {
            args.data = encryptPiiFields(
              args.data as Record<string, unknown>,
              MESSAGE_PII_FIELDS,
            ) as never;
          }
          const result = await query(args);
          return decryptMessageResult(result as Record<string, unknown>) as never;
        },
        async upsert({ args, query }) {
          if (args.create && typeof args.create === "object") {
            args.create = encryptPiiFields(
              args.create as Record<string, unknown>,
              MESSAGE_PII_FIELDS,
            ) as never;
          }
          if (args.update && typeof args.update === "object") {
            args.update = encryptPiiFields(
              args.update as Record<string, unknown>,
              MESSAGE_PII_FIELDS,
            ) as never;
          }
          const result = await query(args);
          return decryptMessageResult(result as Record<string, unknown>) as never;
        },
        async findFirst({ args, query }) {
          const result = await query(args);
          return result
            ? (decryptMessageResult(result as Record<string, unknown>) as never)
            : null;
        },
        async findUnique({ args, query }) {
          const result = await query(args);
          return result
            ? (decryptMessageResult(result as Record<string, unknown>) as never)
            : null;
        },
        async findMany({ args, query }) {
          const results = await query(args);
          return (Array.isArray(results)
            ? results.map((r) => decryptMessageResult(r as Record<string, unknown>))
            : results) as never;
        },
        async delete({ args, query }) {
          const result = await query(args);
          return decryptMessageResult(result as Record<string, unknown>) as never;
        },
        async deleteMany({ args, query }) {
          return query(args);
        },
      },
    },
  });
}

/** The type of the extended Prisma client (used by ServiceContext). */
export type DbClient = ReturnType<typeof withPiiEncryption<PrismaClient>>;

/**
 * The fallback client — used when no shop is registered yet (first run),
 * when the active shop's DB file is missing, or in test mode.
 *
 * This points at the default dev database (data/shops/dev.db via DATABASE_URL).
 * The shop registry bootstraps a "default" shop pointing here on first run,
 * so in normal operation the active-shop path below takes over.
 */
const fallbackClient = (globalForPrisma.prisma as DbClient | undefined) ??
  withPiiEncryption(dbRaw);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = fallbackClient;
}

/**
 * Resolve the Prisma client for the currently active shop.
 *
 * Reads the active shop from the shop registry (data/app-meta.json), gets its
 * dbPath, and returns the cached (or newly created) extended client for that
 * file. Falls back to the default dev client if:
 *   - no shop is registered yet (first run before bootstrap)
 *   - the active shop's dbPath doesn't exist on disk
 *   - we're in a test environment (tests set their own DB via env vars)
 *
 * This reads app-meta.json directly (not via the shops module) to avoid a
 * circular dependency: shops/index.ts → getShopClient → db.ts → shops/index.ts.
 * The JSON shape is stable ({shops:[{id,dbPath,...}], activeShopId}).
 */
function getActiveShopClient(): DbClient {
  // In test mode, always use the fallback client (tests set DATABASE_URL)
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return fallbackClient;
  }

  try {
    const metaPath = resolve(process.cwd(), "data", "app-meta.json");
    if (!existsSync(metaPath)) return fallbackClient;

    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as {
      shops?: Array<{ id: string; dbPath: string }>;
      activeShopId?: string | null;
    };
    const activeId = meta.activeShopId;
    if (!activeId) return fallbackClient;

    const shop = meta.shops?.find((s) => s.id === activeId);
    if (!shop) return fallbackClient;

    const fullPath = resolve(process.cwd(), shop.dbPath);
    if (!existsSync(fullPath)) return fallbackClient;

    return getShopClient(fullPath);
  } catch {
    // Any error reading the registry → fall back to the dev client.
    return fallbackClient;
  }
}

/**
 * The active-shop-aware Prisma client.
 *
 * This is a Proxy that forwards every property access to the currently active
 * shop's Prisma client. When the user switches shops via the topbar selector,
 * subsequent `db.*` calls automatically route to the new shop's SQLite file —
 * no call-site changes needed (all 52 files that import `db` keep working).
 *
 * The resolution happens lazily on each access, so shop switching is immediate.
 * Shop clients are cached in-process (see getShopClient), so the per-access
 * overhead is just a Map lookup + a tiny file read.
 *
 * In test mode, this falls back to the default client (tests set DATABASE_URL).
 */
export const db: DbClient = new Proxy(fallbackClient, {
  get(_target, prop, receiver) {
    const client = getActiveShopClient();
    const value = Reflect.get(client, prop, receiver);
    // Preserve `this` binding for methods (Prisma client methods need it)
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
}) as DbClient;

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
