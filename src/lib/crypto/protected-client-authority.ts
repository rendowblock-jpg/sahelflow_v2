import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import type { PrismaClient } from "@prisma/client";

import { resolveShopProtectedKey } from "@/lib/crypto/protected-key-authority";
import type { ShopProtectedKeyPurpose } from "@/lib/crypto/protected-value";
import type { ShopContext } from "@/lib/shops/context";

const PROTECTED_KEY_PURPOSES = [
  "shop-data",
  "shop-blind-index",
  "shop-secret",
] as const satisfies readonly ShopProtectedKeyPurpose[];

const PROTECTED_MODEL_DELEGATES = new Set([
  "customer",
  "order",
  "conversation",
  "message",
]);

const TRANSACTION_SCOPED_READS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
]);

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
 * Establish one process-bound protected-key and transaction-authority session.
 *
 * Prisma query extensions are inherited by interactive transaction clients,
 * but their closures otherwise retain the root Prisma client. On SQLite, a
 * protected mutation that performs a selector/record-ID lookup through that
 * second connection after the transaction has written can self-contend until
 * the interactive transaction expires.
 *
 * This session solves both authority boundaries:
 *
 * - all purpose-separated key rows are created and authenticated before an
 *   application transaction opens, then codecs reopen only their authenticated
 *   wrapped rows from process memory;
 * - read-only protected-model delegate calls made by extension closures are
 *   routed through the currently active interactive transaction client.
 *
 * No plaintext key is retained here. Temporary unwrapped verification buffers
 * are zeroed immediately, and no environment/file fallback is introduced.
 */
export function createProtectedClientAuthority(
  rawAuthority: PrismaClient,
  context: ShopContext,
): ProtectedClientAuthority {
  const rows = new Map<string, CachedAuthorityRow>();
  const transactionScope = new AsyncLocalStorage<ClientObject>();

  const ready = (async () => {
    const verifiedKeys: Awaited<
      ReturnType<typeof resolveShopProtectedKey>
    >[] = [];
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
  // The first real client operation still receives the rejection. This attached
  // observer only prevents a startup-fast failure from becoming an unhandled
  // rejection before that operation has a chance to await the authority gate.
  void ready.catch(() => undefined);

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
    const delegatedReads = new Map<string, object>();

    function protectedDelegate(
      property: string,
      delegate: object,
    ): object {
      const existing = delegatedReads.get(property);
      if (existing) return existing;
      const routed = new Proxy(delegate, {
        get(rootDelegate, operation, receiver) {
          if (
            typeof operation === "string" &&
            TRANSACTION_SCOPED_READS.has(operation)
          ) {
            return (...args: unknown[]) => {
              const activeTransaction = transactionScope.getStore();
              const selectedDelegate = activeTransaction
                ? (Reflect.get(
                    activeTransaction,
                    property,
                    activeTransaction,
                  ) as object)
                : rootDelegate;
              const selectedOperation = Reflect.get(
                selectedDelegate,
                operation,
                selectedDelegate,
              );
              if (typeof selectedOperation !== "function") {
                throw new TypeError(
                  `Protected ${property}.${operation} delegate is unavailable`,
                );
              }
              return Reflect.apply(selectedOperation, selectedDelegate, args);
            };
          }
          return Reflect.get(rootDelegate, operation, receiver);
        },
      });
      delegatedReads.set(property, routed);
      return routed;
    }

    return new Proxy(target, {
      get(value, property, receiver) {
        if (property === "protectedKeyAuthority" && cachedAuthority) {
          return cachedAuthority;
        }
        if (
          typeof property === "string" &&
          PROTECTED_MODEL_DELEGATES.has(property)
        ) {
          const delegate = Reflect.get(value, property, value);
          if (delegate && typeof delegate === "object") {
            return protectedDelegate(property, delegate);
          }
        }
        if (property === "$transaction") {
          const transaction = Reflect.get(value, property, value);
          if (typeof transaction !== "function") return transaction;
          return async (...args: unknown[]) => {
            await ready;
            const [operation, ...rest] = args;
            if (typeof operation !== "function") {
              return Reflect.apply(transaction, value, args);
            }
            const wrappedOperation = (transactionClient: ClientObject) =>
              transactionScope.run(transactionClient, () =>
                Reflect.apply(operation, undefined, [transactionClient]),
              );
            return Reflect.apply(transaction, value, [wrappedOperation, ...rest]);
          };
        }
        return Reflect.get(value, property, receiver);
      },
    }) as TClient;
  }

  return { ready, bind };
}
