import { SahelFlowError } from "@/types/errors";

/**
 * "The local database was busy", as the WhatsApp receive path labels it.
 *
 * On the Founder's Celeron (F-0031) 260 of 381 delivery failures in 25 days
 * were an anonymous HTTP_500: a Prisma timeout thrown while the app saved a
 * message reaches the generic error wrapper, which answers 500 with no code.
 * A busy database is a state the sidecar can retry and the seller can be told
 * about, so the inbound route answers it as 503 DATABASE_BUSY with a Retry-After
 * hint. Only these errors are relabelled; everything else keeps its answer.
 *
 * The code stays inside the sidecar's failure-code filter (ingress-health.ts,
 * `[A-Za-z0-9_.:-]{1,64}`) and the spool's stricter one (`[A-Za-z0-9_]{1,40}`).
 */
export const DATABASE_BUSY_CODE = "DATABASE_BUSY";
export const DATABASE_BUSY_RETRY_AFTER_SECONDS = 5;

const DATABASE_BUSY_MESSAGE = "The local database was busy";

// P1008 socket timeout, P2028 interactive transaction timeout, P2034 write
// conflict, P1001 / P1002 cannot reach or timed out, P1017 server closed the
// connection.
const BUSY_PRISMA_CODES: ReadonlySet<string> = new Set([
  "P1008",
  "P2028",
  "P2034",
  "P1001",
  "P1002",
  "P1017",
]);

const BUSY_MESSAGE =
  /SQLITE_BUSY|database is locked|Timed out fetching a new connection/iu;

// Matched by class name, not instanceof: Next.js can bundle the Prisma runtime
// once per route, and an error from another copy is still the same error.
function prismaCode(error: Error): string | null {
  const record = error as Error & { code?: unknown; errorCode?: unknown };
  for (const value of [record.code, record.errorCode]) {
    if (typeof value === "string") return value;
  }
  return null;
}

export function isDatabaseBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Already coded by the app (a conflict, a licence refusal, ...): never relabelled.
  if (error instanceof SahelFlowError) return false;
  if (error.name === "PrismaClientInitializationError") return true;
  if (error.name === "PrismaClientKnownRequestError") {
    const code = prismaCode(error);
    if (code && BUSY_PRISMA_CODES.has(code)) return true;
  }
  return BUSY_MESSAGE.test(error.message);
}

/**
 * The 503 DATABASE_BUSY error for a busy-database failure, or null when the
 * error is anything else. The database's own message is never carried over:
 * it can hold a customer's phone number.
 */
export function asDatabaseBusyError(error: unknown): SahelFlowError | null {
  if (!isDatabaseBusyError(error)) return null;
  return new SahelFlowError(DATABASE_BUSY_MESSAGE, DATABASE_BUSY_CODE, 503);
}
