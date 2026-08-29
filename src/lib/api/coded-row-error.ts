/**
 * Coded missing-row mapping (audit 7-a F7).
 *
 * Raw Prisma "record not found" failures (P2025/P2022) escaping a service call
 * surface as an uncoded 500 in withErrorHandler, and legacy bulk flows echo
 * `error.message` straight into per-row response payloads — leaking driver
 * internals to clients. This helper converts a caught error into the coded
 * SahelFlowError the API contract promises, keeping raw diagnostics in logs.
 */
import "server-only";

import { Prisma } from "@prisma/client";

import { NotFoundError, SahelFlowError } from "@/types/errors";

/**
 * SQLite/Prisma string-matched variants of a missing row (service-base.ts
 * precedent) for drivers that surface the condition as a plain Error.
 */
const MISSING_ROW_MESSAGE =
  /record to (update|delete|create) not found|no record was found|record not found/i;

/**
 * Map a caught error from a row lookup/mutation to a coded SahelFlowError.
 *
 * - Coded errors pass through; a NOT_FOUND without the real row id (the
 *   shared service wrapper loses it) is re-issued with the concrete id so the
 *   message stays actionable.
 * - Prisma P2025/P2022 and their string-matched variants become a coded 404.
 * - Anything else becomes a coded, generic 500 that never embeds the raw
 *   driver message — callers must log the original error themselves.
 */
export function codedRowError(
  error: unknown,
  resource: string,
  id: string,
): SahelFlowError {
  if (error instanceof SahelFlowError) {
    if (error.code === "NOT_FOUND") return new NotFoundError(resource, id);
    return error;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2025" || error.code === "P2022")
  ) {
    return new NotFoundError(resource, id);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (MISSING_ROW_MESSAGE.test(message)) {
    return new NotFoundError(resource, id);
  }
  return new SahelFlowError(
    `${resource} could not be updated`,
    "ROW_UPDATE_FAILED",
    500,
  );
}
