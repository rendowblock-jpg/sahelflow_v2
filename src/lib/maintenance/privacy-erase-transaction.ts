import "server-only";

import type { Prisma } from "@prisma/client";

import { dbRaw } from "@/lib/db";

const PRIVACY_ERASE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const;

/**
 * Explicit privileged boundary for the governed all-row privacy erase. The
 * canonical protected client intentionally rejects filterless writes, so the
 * lifecycle calls this maintenance-only raw transaction after authorization and
 * demo-policy locking have already succeeded.
 */
export function withPrivacyEraseTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return dbRaw.$transaction(operation, PRIVACY_ERASE_TRANSACTION_OPTIONS);
}
