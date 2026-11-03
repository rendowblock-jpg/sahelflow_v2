/**
 * Counts `$transaction` calls on a Prisma client without changing what the
 * client does. The wrapper forwards every property to the real client and only
 * wraps `$transaction` (interactive and batch form alike).
 *
 * Used by the idle-queue contract tests: an app with nothing queued must open
 * zero database transactions, because on SQLite every interactive transaction
 * holds the one connection and queues behind (or in front of) the seller's own
 * requests.
 */
export interface TransactionSpy<T extends object> {
  /** The client to hand to code under test. */
  client: T;
  /** Number of `$transaction` calls since creation or the last reset. */
  transactions(): number;
  reset(): void;
}

export function spyOnTransactions<T extends object>(
  client: T,
): TransactionSpy<T> {
  let calls = 0;
  const proxy = new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === "$transaction" && typeof value === "function") {
        return (...args: unknown[]) => {
          calls += 1;
          return (value as (...inner: unknown[]) => unknown).apply(
            target,
            args,
          );
        };
      }
      return value;
    },
  });
  return {
    client: proxy,
    transactions: () => calls,
    reset: () => {
      calls = 0;
    },
  };
}
