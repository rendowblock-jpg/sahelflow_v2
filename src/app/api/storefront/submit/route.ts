import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { dispatchTrigger, type TriggerEvent } from "@/lib/automations/engine";
import { sourceBusinessPrincipal } from "@/lib/business-truth/principal";
import { db, shopContext } from "@/lib/db";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { storefrontService } from "@/lib/storefront/service";
import { dzPhone } from "@/lib/validation";

export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipHits) {
      if (now > entry.resetAt) ipHits.delete(ip);
    }
  }, 300_000).unref?.();
}

function isTauriRequest(request: NextRequest): boolean {
  if (request.headers.get("x-sf-tauri") === "1") return true;
  return /tauri/i.test(request.headers.get("user-agent") ?? "");
}

async function verifyTurnstileToken(
  token: string,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    const body = (await response.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    return false;
  }
}

const submitSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  submissionId: z.string().uuid().optional(),
  customer: z.object({
    name: z.string().trim().min(1).max(100),
    phone: dzPhone,
    wilaya: z.string().trim().min(1).max(120),
    commune: z.string().trim().min(1).max(120),
    address: z.string().trim().min(1).max(500),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        productVariantId: z.string().min(1).nullable().optional(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(100),
  notes: z.string().trim().max(500).optional(),
  website: z.string().max(1000).optional(),
  "cf-turnstile-response": z.string().max(2048).optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown";
  const input = submitSchema.parse(await request.json());

  if (input.website?.trim()) {
    return NextResponse.json(
      {
        ok: true,
        orderNumber: `HP-${Date.now().toString(36)}`,
        orderId: null,
        total: 0,
        replayed: false,
        message: "Order placed successfully! The seller will contact you soon.",
      },
      { status: 201 },
    );
  }

  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many orders. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      },
    );
  }

  if (!isTauriRequest(request) && process.env.TURNSTILE_SECRET_KEY) {
    const token = input["cf-turnstile-response"]?.trim();
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Anti-bot verification required. Please complete the challenge.",
        },
        { status: 400 },
      );
    }
    if (!(await verifyTurnstileToken(token, ip))) {
      return NextResponse.json(
        { error: "Anti-bot verification failed. Please try again." },
        { status: 400 },
      );
    }
  }

  const config = await storefrontService.getBySlug(
    { prisma: db, shop: shopContext },
    input.slug,
  );
  if (!config?.isActive) {
    return NextResponse.json(
      { error: "Storefront not found or inactive" },
      { status: 404 },
    );
  }

  const allowedProductIds = new Set(config.productIds);
  if (input.items.some((item) => !allowedProductIds.has(item.productId))) {
    return NextResponse.json(
      { error: "Product is not available in this storefront" },
      { status: 400 },
    );
  }

  const sourceOrderId = input.submissionId ?? randomUUID();
  const command = await createCanonicalSourceOrder(
    {
      prisma: db,
      shop: shopContext,
      businessPrincipal: sourceBusinessPrincipal("storefront", config.slug),
    },
    {
      idempotencyKey: `storefront:${sourceOrderId}`,
      correlationId: `storefront:${config.slug}:${sourceOrderId}`,
      source: "storefront",
      sourceIdentity: config.slug,
      sourceOrderId,
      newCustomer: input.customer,
      items: input.items,
      wilaya: input.customer.wilaya,
      commune: input.customer.commune,
      address: input.customer.address,
      phone: input.customer.phone,
      deliveryCost: 0,
      notes: input.notes,
    },
  );

  await dispatchTrigger(
    { prisma: db, shop: shopContext },
    "order.created" as TriggerEvent,
    command.result.automation,
    {
      triggerKey: `order.created:${command.result.order.id}`,
      occurredAt: command.result.order.createdAt,
    },
  );

  return NextResponse.json(
    {
      ok: true,
      orderNumber: command.result.order.orderNumber,
      orderId: command.result.order.id,
      total: command.result.order.totalPrice,
      replayed: command.replayed,
      message: "Order placed successfully! The seller will contact you soon.",
    },
    { status: 201 },
  );
}, "POST /api/storefront/submit");
