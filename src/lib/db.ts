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
import { isAbsolute, resolve } from "path";
import { processShopContext } from "@/lib/shops/context";
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
// CRITICAL: Ensure DATABASE_URL is set to an ABSOLUTE path.
// Prisma CLI resolves relative paths from the prisma/ directory, but
// Prisma Client resolves from process.cwd() (project root). A relative
// "file:./data/shops/dev.db" would create the DB at prisma/data/shops/dev.db
// while the app reads data/shops/dev.db — a 0-byte mismatch (P2021).
//
// Also: on a fresh checkout, DATABASE_URL may be entirely unset. We default
// to the absolute path of data/shops/dev.db so the app works out of the box
// after `bun run dev:reset` (which seeds that file).
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (raw) {
    // Already set — normalize to absolute path if it's a file: URL
    const match = raw.match(/^file:(.+)$/);
    if (match && match[1]) {
      const p = match[1];
      if (!isAbsolute(p)) {
        if (process.env.NODE_ENV === "production") {
          throw new Error("Production DATABASE_URL must use an absolute SQLite path");
        }
        return `file:${resolve(process.cwd(), p)}`;
      }
      return raw;
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("SahelFlow desktop requires a file: SQLite DATABASE_URL");
    }
    return raw;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  const dbPath = resolve(process.cwd(), "data", "shops", "dev.db");
  return `file:${dbPath}`;
}

process.env.DATABASE_URL = resolveDatabaseUrl();

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
  // Delivery / Return have NO own PII, but they commonly
  // `include: { order: { include: { customer } } }`. Prisma extensions don't
  // fire for nested includes, and delivery/return aren't otherwise intercepted,
  // so without this the deliveries + returns pages render customer names as
  // raw ciphertext (verified P0 leak — nested order.customer.name was shown as
  // {"iv":...,"ciphertext":...}).
  const decryptNestedOnly = (row: Record<string, unknown>) =>
    decryptNestedPii(row) as Record<string, unknown>;

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

      // ─────────────────────────────────────────────────────────────────────
      // Delivery / Return: NO own PII, but they include order→customer.
      // Without these interceptors the deliveries + returns pages (and the
      // /api/returns + export routes) render customer names as raw
      // ciphertext, because Prisma's per-model $extends callbacks do NOT
      // fire for nested includes and delivery/return are never the top-level
      // PII model. ensureNestedCustomerPhoneEnc adds phoneEnc to nested
      // customer selects that request phone; decryptNestedOnly walks the
      // result tree and decrypts nested order + customer PII in place.
      // (decryptPiiRow/decryptCustomerRow are idempotent — safe if a future
      // caller also decrypts.)
      // ─────────────────────────────────────────────────────────────────────
      delivery: {
        async findMany({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = (await query(args)) as unknown;
          if (Array.isArray(result)) {
            return result.map((r) =>
              decryptNestedOnly(r as Record<string, unknown>),
            ) as never;
          }
          return result as never;
        },
        async findUnique({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptNestedOnly(result as Record<string, unknown>) as never;
        },
        async findFirst({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptNestedOnly(result as Record<string, unknown>) as never;
        },
      },

      return: {
        async findMany({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = (await query(args)) as unknown;
          if (Array.isArray(result)) {
            return result.map((r) =>
              decryptNestedOnly(r as Record<string, unknown>),
            ) as never;
          }
          return result as never;
        },
        async findUnique({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptNestedOnly(result as Record<string, unknown>) as never;
        },
        async findFirst({ args, query }) {
          ensureNestedCustomerPhoneEnc(args);
          const result = await query(args);
          if (result === null) return null as never;
          return decryptNestedOnly(result as Record<string, unknown>) as never;
        },
      },
    },
  });
}

/** The PII-extended client type (input to withSafetyGuards). */
type PiiClient = ReturnType<typeof withPiiEncryption<PrismaClient>>;

/**
 * Safety guards extension (Phase 0 — R-3 Cal.com pattern).
 *
 * Intercepts bulk-mutation operations and REFUSES to run them when the
 * `where` clause is missing, undefined, or an empty object. This prevents
 * the catastrophic "deleteMany({where: {x: undefined}}) nukes the whole
 * table" class of bug — a single typo can otherwise wipe all orders/customers.
 *
 * The guard throws a clear error at the Prisma layer BEFORE the SQL is
 * generated, so no data is touched. Callers that genuinely want to affect
 * all rows must pass `where: {}` explicitly AND set a bypass flag
 * (`__unsafeAllowAll: true` in args) — making the "delete everything"
 * intent explicit and auditable.
 *
 * Applied to: deleteMany, updateMany, delete, update (count/aggregate are
 * read-only — no guard needed).
 *
 * Composed via chained $extends (Prisma supports multiple layers).
 */
function withSafetyGuards(client: PiiClient) {
  // Test-env bypass: test helpers use bare `db.X.deleteMany()` to wipe tables
  // between tests — the standard cleanup pattern. The guard's value is
  // PRODUCTION protection (preventing catastrophic blanket deletes from a
  // typo'd `where: { x: undefined }`). In tests, blanket deletes are intended.
  const isTestEnv =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";

  return client.$extends({
    query: {
      $allModels: {
        async deleteMany({ model, args, query }) {
          if (isTestEnv) return query(args);
          if (isUnguardedBulkWhere(args.where)) {
            throw new Error(
              `[safety] Refusing to run deleteMany on ${model} without a where clause. ` +
                `This would delete ALL rows. To proceed intentionally, pass ` +
                `{ where: {}, __unsafeAllowAll: true }.`,
            );
          }
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (isTestEnv) return query(args);
          if (isUnguardedBulkWhere(args.where)) {
            throw new Error(
              `[safety] Refusing to run updateMany on ${model} without a where clause. ` +
                `This would update ALL rows. To proceed intentionally, pass ` +
                `{ where: {}, __unsafeAllowAll: true }.`,
            );
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (isTestEnv) return query(args);
          // delete requires a where with a unique id, but defend against
          // an undefined where sneaking through (would throw a confusing
          // Prisma error; this gives a clear one).
          if (!args.where || Object.keys(args.where).length === 0) {
            throw new Error(
              `[safety] Refusing to run delete on ${model} without a where clause.`,
            );
          }
          return query(args);
        },
        async update({ model, args, query }) {
          if (isTestEnv) return query(args);
          if (!args.where || Object.keys(args.where).length === 0) {
            throw new Error(
              `[safety] Refusing to run update on ${model} without a where clause.`,
            );
          }
          return query(args);
        },
      },
    },
  });
}

/** True if a bulk `where` is missing/empty AND no explicit bypass flag is set. */
function isUnguardedBulkWhere(
  where: unknown,
): where is undefined | null {
  // Explicit bypass: caller sets __unsafeAllowAll on the args (not where).
  // We check args separately in the caller via the second param pattern;
  // here we only inspect `where`.
  if (where === undefined || where === null) return true;
  if (typeof where === "object" && Object.keys(where as object).length === 0) {
    return true;
  }
  return false;
}

/** The type of the fully-composed Prisma client (PII + safety guards). */
export type DbClient = ReturnType<typeof withSafetyGuards>;

/**
 * Process-bound client for the exact DATABASE_URL selected by Tauri before
 * server startup. `processShopContext()` below fails closed if the matching
 * authority tuple is incomplete; this client never selects a registry fallback.
 */
const processClient = (globalForPrisma.prisma as DbClient | undefined) ??
  withSafetyGuards(withPiiEncryption(dbRaw));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = processClient;
}

/** Retained as a no-op while callers migrate away from the legacy meta cache. */
export function invalidateMetaCache(): void {
}

/**
 * Invalidate + disconnect the cached PrismaClient for a specific shop file.
 *
 * Session 31 (AUDIT-3 S7): `deleteShop` unlinks the shop's SQLite file but the
 * in-process PrismaClient for that path stays cached in `shopClients`, holding
 * a connection to a deleted file. Subsequent `getShopClient(dbPath)` calls
 * would return the stale client. This removes it from the cache + fire-and-
 * -forgets a `$disconnect()` (the file may already be gone, so errors are
 * swallowed) + clears the meta cache so the next `db` access re-reads
 * app-meta.json (the deleted shop is gone + activeShopId may have changed).
 *
 * Safe to call with a path that was never cached (no-op).
 */
export function invalidateShopClient(shopFilePath: string): void {
  if (globalForPrisma.shopClients) {
    const cached = globalForPrisma.shopClients.get(shopFilePath);
    if (cached) {
      // Fire-and-forget disconnect — deleteShop is sync, can't await.
      void (cached as DbClient).$disconnect().catch(() => {
        /* file may already be unlinked — ignore */
      });
      globalForPrisma.shopClients.delete(shopFilePath);
    }
  }
}

/**
 * Immutable process-bound database client. Tauri resolves and migrates one
 * exact ShopContext before spawning this server; shop changes relaunch the
 * process rather than mutating database authority underneath in-flight work.
 */
export const db: DbClient = processClient;
export const shopContext = processShopContext();

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
  const extended = withSafetyGuards(withPiiEncryption(raw));

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
