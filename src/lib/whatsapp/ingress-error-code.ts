import { z } from "zod";

import { SahelFlowError } from "@/types/errors";

const MAX_LENGTH = 128;
const PRISMA_CODE = /^P\d{4}$/;

/** The Prisma code of a database error (P1008, P2034, ...), or null. */
function prismaCode(error: Error): string | null {
  const record = error as Error & { code?: unknown; errorCode?: unknown };
  for (const value of [record.code, record.errorCode]) {
    if (typeof value === "string" && PRISMA_CODE.test(value)) return value;
  }
  return null;
}

/**
 * A short, content-free code for a failed WhatsApp delivery. It is stored on
 * the ingress attempt, shown in the recovery dock and sent back to the
 * sidecar, which writes it to the diagnostics log.
 *
 * A database error used to be reduced to its class name, so a first delivery
 * that failed and healed on the next attempt could not be explained. Now the
 * Prisma code is kept ("PrismaClientKnownRequestError:P2034"): it separates a
 * busy database from a real fault. Never the message, the meta or any value:
 * those can hold a customer's phone number or name.
 */
export function ingressErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return "INVALID_PROVIDER_PAYLOAD";
  if (error instanceof SahelFlowError) return error.code.slice(0, MAX_LENGTH);
  if (error instanceof Error && error.name) {
    const detail = prismaCode(error);
    if (!detail) return error.name.slice(0, MAX_LENGTH);
    return `${error.name.slice(0, MAX_LENGTH - detail.length - 1)}:${detail}`;
  }
  return "INGRESS_PROCESSING_FAILED";
}
