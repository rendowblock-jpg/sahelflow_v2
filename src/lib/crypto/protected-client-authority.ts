import "server-only";

import type { PrismaClient } from "@prisma/client";

import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import type { ShopProtectedKeyPurpose } from "@/lib/crypto/protected-value";
import type { ShopContext } from "@/lib/shops/context";

const PROTECTED_KEY_PURPOSES = [
  "shop-data",
  "shop-blind-index",
  "shop-secret",
] as const satisfies readonly ShopProtectedKeyPurpose[];

interface CachedAuthorityRow {
  purpose: string;
  formatVersion: number;
  algorithm: string;
  keyVersion: number;
  keyId: string;
  wrappingKeyId: string;
  wrappedKey: string;
}

interface FindUniqueArgs {
  where: { purpose: string };
  select?: Record<string, boolean | undefined>;
}

type ClientObject = object & {
  $transaction?: (...args: unknown[]) => unknown;
  protectedKeyAuthority?: object;
};

export interface ProtectedClientAuthority {
  readonly ready: Promise<void>;
  bind<TClient extends object>(client: TClient): TClient;
}

function selectedRow(
  row: CachedAuthorityRow,
  select?: Record<string, boolean | undefined>,
): Record<string, unknown> {
  if (!select) return { ...row };
  const output: Record<string, unknown> = {};
  for (const [field, included] of Object.entries(select)) {
    if (included && field in row) {
      output[field] = row[field as keyof CachedAuthorityRow];
    }
  }
  return output;
}

/**
 * Establish one process-bound protected-key session before application
 * transactions begin.
 *
 * Prisma query extensions are inherited by interactive transaction clients,
 * but their closures otherwise resolve ProtectedKeyAuthority through the root
 * Prisma connection. On SQLite, creating or reading that authority after an
 * interactive transaction has acquired its write lock can self-contend until
 * the transaction expires. This session creates/verifies all purpose-separated
 * authorities on the root connection first, snapshots only their authenticated
 * wrapped rows in memory, and makes every protected codec reopen those rows
 * without a second database connection.
 *
 * The final client is also bound so `$transaction` cannot open before the
 * authority session is ready. No plaintext key is stored in this session; the
 * temporary unwrapped buffers used for verification are zeroed immediately.
 */
export function createProtectedClientAuthority(
  rawAuthority: PrismaClient,
  context: ShopContext,
): ProtectedClientAuthority {
  const rows = new Map<string, CachedAuthorityRow>();

  const ready = (async () => {
    const verifiedKeys = [];
    try {
      for (const purpose of PROTECTED_KEY_PURPOSES) {
        verifiedKeys.push(
          await resolveShopProtectedKey(rawAuthority, purpose, {
            shopContext: context,
          }),
        );
      }

      const persisted = await rawAuthority.protectedKeyAuthority.findMany({
        where: { purpose: { in: [...PROTECTED_KEY_PURPOSES] } },
        select: {
          purpose: true,
          formatVersion: true,
          algorithm: true,
          keyVersion: true,
          keyId: true,
          wrappingKeyId: true,
          wrappedKey: true,
        },
      });
      for (const row of persisted) rows.set(row.purpose, row);
      for (const purpose of PROTECTED_KEY_PURPOSES) {
        if (!rows.has(purpose)) {
          throw new Error(
            `Protected key authority session is missing persisted ${purpose} authority`,
          );
        }
      }
    } finally {
      for (const authority of verifiedKeys) authority.key.fill(0);
    }
  })();

  function bind<TClient extends object>(client: TClient): TClient {
    const target = client as ClientObject;
    const realAuthority = Reflect.get(
      target,
      "protectedKeyAuthority",
      target,
    ) as object | undefined;
    const cachedAuthority = realAuthority
      ? new Proxy(realAuthority, {
          get(delegate, property, receiver) {
            if (property === "findUnique") {
              return async (args: FindUniqueArgs) => {
                await ready;
                const row = rows.get(args.where.purpose);
                return row ? selectedRow(row, args.select) : null;
              };
            }
            return Reflect.get(delegate, property, receiver);
          },
        })
      : undefined;

    return new Proxy(target, {
      get(value, property, receiver) {
        if (property === "protectedKeyAuthority" && cachedAuthority) {
          return cachedAuthority;
        }
        if (property === "$transaction") {
          const transaction = Reflect.get(value, property, value);
          if (typeof transaction !== "function") return transaction;
          return async (...args: unknown[]) => {
            await ready;
            return Reflect.apply(transaction, value, args);
          };
        }
        return Reflect.get(value, property, receiver);
      },
    }) as TClient;
  }

  return { ready, bind };
}
