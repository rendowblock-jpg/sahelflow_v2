/**
 * Process-bound Prisma client and Phase 4 protected-data extension.
 *
 * `db` is the canonical application client. Customer, Order, Conversation and
 * Message protected fields are written as contextual AEAD envelopes under
 * purpose-separated random shop keys. Reads accept the canonical format and the
 * authenticated legacy generation until the all-shop migration converges.
 *
 * `dbRaw` is an explicit low-level authority retained for migration, recovery,
 * evidence and narrowly scoped tests. Production domain code must use `db`.
 */
import "server-only";

import { createHash } from "node:crypto";
import { basename, isAbsolute, resolve } from "node:path";

import { PrismaClient } from "@prisma/client";

import { withProtectedNestedReads } from "@/lib/crypto/with-protected-nested";
import { withProtectedPiiEncryption } from "@/lib/crypto/with-protected-pii";
import { assertProcessShopAuthority } from "@/lib/shops/authority";
import { processShopContext, type ShopContext } from "@/lib/shops/context";

const globalForPrisma = globalThis as unknown as {
  prisma: unknown;
  prismaRaw: PrismaClient | undefined;
  shopClients: Map<string, unknown> | undefined;
};

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (raw) {
    const match = raw.match(/^file:(.+)$/);
    if (match?.[1]) {
      const databasePath = match[1];
      if (!isAbsolute(databasePath)) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "Production DATABASE_URL must use an absolute SQLite path",
          );
        }
        return `file:${resolve(process.cwd(), databasePath)}`;
      }
      return raw;
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SahelFlow desktop requires a file: SQLite DATABASE_URL",
      );
    }
    return raw;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }
  return `file:${resolve(process.cwd(), "data", "shops", "dev.db")}`;
}

function databasePathFromUrl(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("SahelFlow shop database URL is not a file: SQLite URL");
  }
  return resolve(databaseUrl.slice("file:".length));
}

process.env.DATABASE_URL = resolveDatabaseUrl();

export const dbRaw =
  globalForPrisma.prismaRaw ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaRaw = dbRaw;
}

type ProtectedPiiClient = ReturnType<
  typeof withProtectedPiiEncryption<PrismaClient>
>;
type ProtectedReadClient = ReturnType<
  typeof withProtectedNestedReads<ProtectedPiiClient>
>;

function withSafetyGuards(client: ProtectedReadClient) {
  const isTestEnv =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";

  return client.$extends({
    query: {
      $allModels: {
        async deleteMany({ model, args, query }) {
          if (isTestEnv) return query(args);
          if (isUnguardedBulkWhere(args.where)) {
            throw new Error(
              `[safety] Refusing to run deleteMany on ${model} without a where clause. This would delete all rows.`,
            );
          }
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (isTestEnv) return query(args);
          if (isUnguardedBulkWhere(args.where)) {
            throw new Error(
              `[safety] Refusing to run updateMany on ${model} without a where clause. This would update all rows.`,
            );
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (isTestEnv) return query(args);
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

function isUnguardedBulkWhere(where: unknown): where is undefined | null {
  if (where === undefined || where === null) return true;
  return (
    typeof where === "object" &&
    Object.keys(where as Record<string, unknown>).length === 0
  );
}

type SafetyGuardedClient = ReturnType<typeof withSafetyGuards>;

const SHOP_WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

function withShopAuthority(
  client: SafetyGuardedClient,
  context: ShopContext,
) {
  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (
            process.env.NODE_ENV === "production" &&
            SHOP_WRITE_OPERATIONS.has(operation)
          ) {
            assertProcessShopAuthority(context);
          }
          return query(args);
        },
      },
    },
  });
}

export type DbClient = ReturnType<typeof withShopAuthority>;

function protectedClient(raw: PrismaClient, context: ShopContext) {
  const pii = withProtectedPiiEncryption(raw, context);
  return withProtectedNestedReads(pii, raw, context);
}

const boundShopContext = processShopContext();
const processClient =
  (globalForPrisma.prisma as DbClient | undefined) ??
  withShopAuthority(
    withSafetyGuards(protectedClient(dbRaw, boundShopContext)),
    boundShopContext,
  );

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = processClient;
}

export function invalidateMetaCache(): void {}

export function invalidateShopClient(shopFilePath: string): void {
  const cache = globalForPrisma.shopClients;
  if (!cache) return;
  const cached = cache.get(shopFilePath);
  if (!cached) return;
  void (cached as DbClient).$disconnect().catch(() => {
    /* the file may already be quarantined or removed */
  });
  cache.delete(shopFilePath);
}

export const db: DbClient = processClient;
export const shopContext = boundShopContext;

function developmentContextForPath(shopFilePath: string): ShopContext {
  const resolvedPath = resolve(shopFilePath);
  const databaseFileId = basename(resolvedPath);
  const identity = createHash("sha256")
    .update("sahelflow.development-shop-context.v1\0", "utf8")
    .update(resolvedPath, "utf8")
    .digest("hex")
    .slice(0, 32);
  const candidateShopId = databaseFileId
    .replace(/\.db$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return Object.freeze({
    ...boundShopContext,
    shopId: candidateShopId || "development-shop",
    shopIncarnationId: identity,
    databaseFileId,
  });
}

export function getShopClient(
  shopFilePath: string,
  _encryptionKey?: string,
): DbClient {
  const resolvedPath = resolve(shopFilePath);
  const boundPath = databasePathFromUrl(process.env.DATABASE_URL!);
  if (
    process.env.NODE_ENV === "production" &&
    resolvedPath.toLowerCase() !== boundPath.toLowerCase()
  ) {
    throw new Error(
      "Packaged shop changes require a desktop-supervisor process transition",
    );
  }

  globalForPrisma.shopClients ??= new Map();
  const existing = globalForPrisma.shopClients.get(resolvedPath) as
    | DbClient
    | undefined;
  if (existing) return existing;

  const context =
    resolvedPath.toLowerCase() === boundPath.toLowerCase()
      ? boundShopContext
      : developmentContextForPath(resolvedPath);
  const raw = new PrismaClient({
    datasourceUrl: `file:${resolvedPath}`,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
  const extended = withShopAuthority(
    withSafetyGuards(protectedClient(raw, context)),
    context,
  );
  globalForPrisma.shopClients.set(resolvedPath, extended);
  return extended;
}

export async function disconnectAllShops(): Promise<void> {
  if (globalForPrisma.shopClients) {
    await Promise.all(
      [...globalForPrisma.shopClients.values()].map((client) =>
        (client as DbClient).$disconnect(),
      ),
    );
    globalForPrisma.shopClients.clear();
  }
  await dbRaw.$disconnect();
}
