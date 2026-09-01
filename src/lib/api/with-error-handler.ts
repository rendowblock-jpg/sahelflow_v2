/**
 * withErrorHandler — HOF that wraps a Next.js App Router route handler with
 * consistent error handling. Eliminates the ~700 lines of duplicated
 * try/catch boilerplate across 44 API routes (handoff T-005).
 *
 * FD-052 option A (coexist): the Algerian demo workspace no longer freezes
 * ordinary mutations. Real commerce/inbox/provider operations run while demo
 * data is loaded; demo rows keep their `demo-` id tagging and are counted in
 * stats and reports until removed (Founder-accepted mixing). The remaining
 * demo boundary is narrow: demo-tagged orders/shipments must not generate
 * real courier provider effects (DEMO_PROVIDER_EFFECT_BLOCKED at the booking,
 * booking-sync, delivery-create and delivery-sync entries).
 *
 * Usage:
 *   export const POST = withErrorHandler(async (req) => {
 *     const body = await req.json();
 *     const order = await orderService.create({ prisma: db, shop: shopContext }, body);
 *     return NextResponse.json({ order }, { status: 201 });
 *   }, "POST /api/orders");
 *
 * Error mapping:
 *   - ZodError        → 400 { error: "Validation failed", details,
 *                            code: "REQUEST_VALIDATION_FAILED" }
 *   - SyntaxError     → 400 { error: "Invalid JSON in request body",
 *                            code: "INVALID_REQUEST_JSON" }
 *   - SahelFlowError  → err.statusCode { error, code }
 *   - everything else → 500 { error: "Internal server error" } + structured log
 *
 * Campaign row B5 (round 2): the two shape-level 400 branches above were
 * anonymous — a malformed request died before the route's own coded
 * rejections ran, and installed clients fell back to the generic HTTP_<status>
 * label. Both branches now carry stable codes so every 400 is diagnosable.
 */
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SahelFlowError } from "@/types/errors";
import { logger } from "@/lib/logger";
import { captureError } from "@/lib/monitoring/sentry";
import { redactError } from "@/lib/redact-pii";
import { shopContext } from "@/lib/db";
import { assertProcessShopAuthority } from "@/lib/shops/authority";
import { requireLicenseEntitlement } from "@/lib/license/license-authority";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteHandler = (...args: any[]) => Promise<NextResponse>;

// Audit 7-a F9: the dead /api/payment and /api/support entries were removed —
// no such routes exist, so the allowlist no longer admits their path prefix.
// The FD-052 option A coexist decision removed the former demo mutation
// allowlist alongside the DEMO_MUTATION_BLOCKED gate it served.
const LICENSE_LOCKOUT_ALLOWLIST = [
  /^\/api\/auth\/(?:login|logout|reauthenticate|setup|status)$/,
  /^\/api\/health(?:\/|$)/,
  /^\/api\/internal\/runtime-ready(?:\/|$)/,
  /^\/api\/license(?:\/|$)/,
] as const;

function resolveRequestPath(req: NextRequest | undefined, label?: string): string {
  const pathname = req?.nextUrl?.pathname;
  if (pathname) return pathname;
  return label?.match(/(\/api\/[^\s?]+)/)?.[1] ?? "";
}

function isAllowedDuringLicenseLockout(pathname: string): boolean {
  return LICENSE_LOCKOUT_ALLOWLIST.some((pattern) => pattern.test(pathname));
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

      const pathname = resolveRequestPath(req, label);
      if (
        process.env.NODE_ENV === "production" &&
        pathname.startsWith("/api/") &&
        !isAllowedDuringLicenseLockout(pathname)
      ) {
        await requireLicenseEntitlement();
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
          {
            error: "Validation failed",
            details: err.issues,
            code: "REQUEST_VALIDATION_FAILED",
          },
          { status: 400 },
        );
      }
      // Malformed JSON body — return 400, not 500
      if (err instanceof SyntaxError) {
        return NextResponse.json(
          {
            error: "Invalid JSON in request body",
            code: "INVALID_REQUEST_JSON",
          },
          { status: 400 },
        );
      }
      if (err instanceof SahelFlowError) {
        if (err.statusCode >= 500) {
          logger.error(`api.${logPath}`, err, { code: err.code });
        } else {
          // Coded 4xx rejections stay invisible otherwise; the app log line
          // with the exact code is the primary installed-build diagnostic
          // (e.g. LICENSE_*, DEMO_PROVIDER_EFFECT_BLOCKED, PROTECTED_DATA_*).
          logger.warn(`api.${logPath}`, {
            code: err.code,
            statusCode: err.statusCode,
          });
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
