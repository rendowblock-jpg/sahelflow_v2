/**
 * withErrorHandler — HOF that wraps a Next.js App Router route handler with
 * consistent error handling. Eliminates the ~700 lines of duplicated
 * try/catch boilerplate across 44 API routes (handoff T-005).
 *
 * Usage:
 *   export const POST = withErrorHandler(async (req) => {
 *     const body = await req.json();
 *     const order = await orderService.create({ prisma: db }, body);
 *     return NextResponse.json({ order }, { status: 201 });
 *   }, "POST /api/orders");
 *
 * Error mapping:
 *   - ZodError        → 400 { error: "Validation failed", details }
 *   - SahelFlowError  → err.statusCode { error, code }
 *   - everything else → 500 { error: "Internal server error" } + structured log
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SahelFlowError } from "@/types/errors";
import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (...args: any[]) => Promise<NextResponse>;

export function withErrorHandler<T extends RouteHandler>(
  handler: T,
  label?: string,
): T {
  const wrapped = async (...args: Parameters<T>): Promise<NextResponse> => {
    const req = args[0] as NextRequest | undefined;
    const path = label ?? req?.nextUrl?.pathname ?? "unknown";
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation failed", details: err.issues },
          { status: 400 },
        );
      }
      if (err instanceof SahelFlowError) {
        if (err.statusCode >= 500) {
          logger.error(`api.${path}`, err, { code: err.code });
        }
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.statusCode },
        );
      }
      logger.error(
        `api.${path}.unexpected`,
        err instanceof Error ? err : undefined,
      );
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
  return wrapped as T;
}
