/**
 * withErrorHandler — HOF that wraps a Next.js App Router route handler with
 * consistent error handling. Eliminates the ~700 lines of duplicated
 * try/catch boilerplate across 44 API routes (handoff T-005).
 *
 * Usage:
 *   export const POST = withErrorHandler(async (req) => {
 *     const body = await req.json();
 *     const order = await orderService.create({ prisma: db, shop: shopContext }, body);
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
import { captureError } from "@/lib/monitoring/sentry";
import { redactError } from "@/lib/redact-pii";
import { db, shopContext } from "@/lib/db";
import { assertProcessShopAuthority } from "@/lib/shops/authority";
import { isAlgerianDemoLoaded } from "@/lib/demo/algerian-demo-policy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (...args: any[]) => Promise<NextResponse>;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * The demo workspace is a read-only evaluator surface. These routes are the
 * minimum control-plane exceptions required to authenticate, remove/reset the
 * demo, clear settings, prove runtime readiness, update the application, or
 * switch/create shops. All ordinary commerce/inbox/provider mutations fail
 * closed while the marker is loaded.
 */
const DEMO_MUTATION_ALLOWLIST = [
  /^\/api\/auth(?:\/|$)/,
  /^\/api\/demo-data(?:\/|$)/,
  /^\/api\/health(?:\/|$)/,
  /^\/api\/internal(?:\/|$)/,
  /^\/api\/license(?:\/|$)/,
  /^\/api\/reports\/daily(?:\/|$)/,
  /^\/api\/settings(?:\/|$)/,
  /^\/api\/shops(?:\/|$)/,
  /^\/api\/updates?(?:\/|$)/,
] as const;

function resolveRequestMethod(req: NextRequest | undefined, label?: string): string {
  return (req?.method ?? label?.trim().split(/\s+/, 1)[0] ?? "GET").toUpperCase();
}

function resolveRequestPath(req: NextRequest | undefined, label?: string): string {
  const pathname = req?.nextUrl?.pathname;
  if (pathname) return pathname;
  return label?.match(/(\/api\/[^\s?]+)/)?.[1] ?? "";
}

function isAllowedDemoMutation(pathname: string): boolean {
  return DEMO_MUTATION_ALLOWLIST.some((pattern) => pattern.test(pathname));
}

export function withErrorHandler<T extends RouteHandler>(
  handler: T,
  label?: string,
): T {
  const wrapped = async (...args: Parameters<T>): Promise<NextResponse> => {
    const req = args[0] as NextRequest | undefined;
    const logPath = label ?? req?.nextUrl?.pathname ?? "unknown";
    try {
      if (process.env.NODE_ENV === "production") {
        assertProcessShopAuthority(shopContext);
      }

      const method = resolveRequestMethod(req, label);
      const pathname = resolveRequestPath(req, label);
      if (
        MUTATING_METHODS.has(method) &&
        pathname.startsWith("/api/") &&
        !isAllowedDemoMutation(pathname) &&
        (await isAlgerianDemoLoaded(db))
      ) {
        throw new SahelFlowError(
          "This Algerian demo workspace is read-only. Remove or reset the demo before creating or changing seller data.",
          "DEMO_MUTATION_BLOCKED",
          409,
        );
      }

      const response = await handler(...args);
      response.headers.set("X-SahelFlow-Shop-Id", shopContext.shopId);
      response.headers.set(
        "X-SahelFlow-Registry-Revision",
        String(shopContext.registryRevision),
      );
      return response;
    } catch (err) {
      if (err instanceof z.ZodError) {
        return NextResponse.json(
          { error: "Validation failed", details: err.issues },
          { status: 400 },
        );
      }
      // Malformed JSON body — return 400, not 500
      if (err instanceof SyntaxError) {
        return NextResponse.json(
          { error: "Invalid JSON in request body" },
          { status: 400 },
        );
      }
      if (err instanceof SahelFlowError) {
        if (err.statusCode >= 500) {
          logger.error(`api.${logPath}`, err, { code: err.code });
        }
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.statusCode },
        );
      }
      logger.error(
        `api.${logPath}.unexpected`,
        err instanceof Error ? err : undefined,
      );
      // Wave 2: capture to Sentry (no-op if SENTRY_DSN not set).
      // W3-24: redact PII from the error BEFORE capturing — Prisma errors,
      // validation messages, and stack traces can contain customer phone,
      // email, or address. The redacted copy goes to Sentry; the original
      // (full) error is what we logged above for local debugging.
      void captureError(redactError(err), { path: logPath, method: req?.method });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
  return wrapped as T;
}
