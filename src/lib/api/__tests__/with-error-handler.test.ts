/**
 * withErrorHandler tests — error mapping for API routes.
 *
 * NOTE: We don't construct real NextRequest objects (they require the Next.js
 * runtime which isn't available in vitest's node environment). Instead we pass
 * undefined as the first arg + always provide a label, so withErrorHandler
 * never tries to read req.nextUrl.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "../with-error-handler";
import {
  SahelFlowError,
  NotFoundError,
  ValidationError,
  ConflictError,
  InvalidTransitionError,
  RateLimitError,
} from "@/types/errors";

// Mock the logger to avoid console noise in tests
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return res.json();
}

// Cast the wrapped handler to a simple callable type for testing.
// (withErrorHandler's generic T propagates the original handler's arg types,
// which we don't want in tests where we pass undefined.)
type AnyHandler = (...args: unknown[]) => Promise<NextResponse>;

function wrap(handler: () => Promise<NextResponse>): AnyHandler {
  return withErrorHandler(handler, "TEST") as unknown as AnyHandler;
}

describe("withErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the handler's response on success", async () => {
    const handler = wrap(async () => NextResponse.json({ ok: true }));
    const res = await handler();
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).ok).toBe(true);
  });

  it("maps ZodError → 400 Validation failed", async () => {
    const handler = wrap(async () => {
      const schema = z.object({ name: z.string() });
      schema.parse({ name: 123 }); // throws ZodError
      return NextResponse.json({});
    });
    const res = await handler();
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("maps NotFoundError → 404", async () => {
    const handler = wrap(async () => {
      throw new NotFoundError("Order", "abc");
    });
    const res = await handler();
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toContain("Order not found");
    expect(body.code).toBe("NOT_FOUND");
  });

  it("maps ValidationError → 400", async () => {
    const handler = wrap(async () => {
      throw new ValidationError("Bad input");
    });
    const res = await handler();
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toBe("Bad input");
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("maps ConflictError → 409", async () => {
    const handler = wrap(async () => {
      throw new ConflictError("Duplicate");
    });
    const res = await handler();
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).code).toBe("CONFLICT");
  });

  it("maps InvalidTransitionError → 409", async () => {
    const handler = wrap(async () => {
      throw new InvalidTransitionError("draft", "delivered", ["pending"]);
    });
    const res = await handler();
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).code).toBe("INVALID_TRANSITION");
  });

  it("maps RateLimitError → 429", async () => {
    const handler = wrap(async () => {
      throw new RateLimitError(5000);
    });
    const res = await handler();
    expect(res.status).toBe(429);
    expect((await bodyOf(res)).code).toBe("RATE_LIMIT");
  });

  it("maps generic SahelFlowError → its statusCode", async () => {
    const handler = wrap(async () => {
      throw new SahelFlowError("Custom", "CUSTOM", 418);
    });
    const res = await handler();
    expect(res.status).toBe(418);
    expect((await bodyOf(res)).code).toBe("CUSTOM");
  });

  it("maps unknown errors → 500 Internal server error", async () => {
    const handler = wrap(async () => {
      throw new Error("Something broke");
    });
    const res = await handler();
    expect(res.status).toBe(500);
    expect((await bodyOf(res)).error).toBe("Internal server error");
  });

  it("maps non-Error throws → 500", async () => {
    const handler = wrap(async () => {
      throw "string error";
    });
    const res = await handler();
    expect(res.status).toBe(500);
  });
});
