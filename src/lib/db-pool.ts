/**
 * One database connection per shop database (F-0043).
 *
 * WHY. Prisma starts every interactive transaction on SQLite with `BEGIN IMMEDIATE`, which takes the
 * database WRITE lock at once. A second transaction (or any write) that needs the lock waits for it
 * with SQLite's busy handler, and that wait is a blocking call made on one of the query engine's
 * worker threads. The engine has one worker thread per CPU the process may use. When as many
 * connections are waiting for the lock as there are worker threads, the whole engine is stuck:
 * the connection that holds the lock cannot run its next query or COMMIT either, so nothing moves
 * until the 5-second busy timeout fires, and the waiters then fail one after the other (5 s, 10 s,
 * 15 s ...). On the seller's 2-core PC two overlapping worker transactions are enough.
 * Measured with audit/program/ui/prisma-probe.mjs: 6 overlapping read-then-write transactions took
 * 25 s with 5 failures on one CPU and 5.1 s with 4 failures on four CPUs; with one connection they
 * take about 0.3 s and all succeed.
 *
 * WHAT. With a single connection every statement waits in Prisma's connection pool instead, which is
 * an ordinary asynchronous wait that blocks no thread. The price is that a running transaction holds
 * the connection, so other queries queue behind it: keep transactions short.
 *
 * TWO SETTINGS GO TOGETHER. `connection_limit=1` alone is not enough: Prisma gives an interactive
 * transaction only `maxWait` (default 2 s) to obtain the connection, and with a queue of transactions
 * the later ones then fail with P2028 "Unable to start a transaction in the given time" (measured:
 * 4 of 6 failed). `shopPrismaClientOptions` therefore raises `maxWait` too.
 */
import type { Prisma } from "@prisma/client";

/** How long a plain query or a starting transaction may wait for the one connection. */
export const SHOP_POOL_TIMEOUT_SECONDS = 60;
/** Prisma `transactionOptions.maxWait` (ms): how long a transaction may wait for its turn. */
export const SHOP_TRANSACTION_MAX_WAIT_MS = 30_000;

/**
 * Add `connection_limit=1` and `pool_timeout` to a `file:` SQLite URL. A parameter that is already
 * in the URL is kept as written, so an operator or a test can still override it. Anything that is
 * not a `file:` URL is returned unchanged.
 */
export function withSingleConnectionPool(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) return databaseUrl;
  const queryStart = databaseUrl.indexOf("?");
  const base = queryStart === -1 ? databaseUrl : databaseUrl.slice(0, queryStart);
  const params = new URLSearchParams(
    queryStart === -1 ? "" : databaseUrl.slice(queryStart + 1),
  );
  if (!params.has("connection_limit")) params.set("connection_limit", "1");
  if (!params.has("pool_timeout")) {
    params.set("pool_timeout", String(SHOP_POOL_TIMEOUT_SECONDS));
  }
  return `${base}?${params.toString()}`;
}

/**
 * The PrismaClient options every shop database client must be built with. Spread them into the
 * constructor next to `log`. With no URL (the client then reads DATABASE_URL by itself) only the
 * transaction option can be given.
 */
export function shopPrismaClientOptions(
  databaseUrl?: string,
): Pick<Prisma.PrismaClientOptions, "datasourceUrl" | "transactionOptions"> {
  const transactionOptions = { maxWait: SHOP_TRANSACTION_MAX_WAIT_MS };
  if (!databaseUrl) return { transactionOptions };
  return {
    datasourceUrl: withSingleConnectionPool(databaseUrl),
    transactionOptions,
  };
}
