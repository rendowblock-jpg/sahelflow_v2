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
 * NO POOL TIMEOUT ON SQLITE. Prisma's `pool_timeout` has no effect on SQLite (measured, Prisma 6.19: with
 * `pool_timeout=1` and with the default, plain reads waited up to 11.9 s for a busy connection and none
 * failed). A plain query therefore waits for the connection without a limit of its own; a transaction
 * waiting for its turn is limited by `maxWait`, and any query waiting inside its own transaction is
 * limited by that transaction's `timeout`, after which the engine rolls the transaction back.
 *
 * TWO SETTINGS GO TOGETHER. `connection_limit=1` alone is not enough: Prisma gives an interactive
 * transaction only `maxWait` (default 2 s) to obtain the connection, and with a queue of transactions
 * the later ones then fail with P2028 "Unable to start a transaction in the given time" (measured:
 * 4 of 6 failed). `shopPrismaClientOptions` therefore raises `maxWait` too.
 */
import type { Prisma } from "@prisma/client";

/**
 * ONE raw client per process, shared by every copy of src/lib/db.ts (F-0043).
 *
 * Next.js compiles the same source file once per layer: the instrumentation hook (which starts the
 * background workers) and the route handlers each get their OWN copy of db.ts, with their own
 * module variables. Without a process-wide holder that means two PrismaClient objects, two query
 * engines and two SQLite connections to the one shop database, and `connection_limit=1` then only
 * limits each of them. Measured on the production build: 1 file descriptor on the database right
 * after start, 2 after the first requests, and the original 5-s freezes were still there under load.
 * `globalThis` is the one thing every layer shares, so the holder lives there, in production too
 * (the usual "only cache outside production" habit exists to stop dev hot-reload from leaking
 * clients; a packaged process never reloads).
 */
export function shareRawClient<T>(
  holder: { prismaRaw?: T | undefined },
  create: () => T,
): T {
  holder.prismaRaw ??= create();
  return holder.prismaRaw;
}

/** Prisma `transactionOptions.maxWait` (ms): how long a transaction may wait for its turn. */
export const SHOP_TRANSACTION_MAX_WAIT_MS = 30_000;

/**
 * Add `connection_limit=1` to a `file:` SQLite URL. A parameter that is already
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
