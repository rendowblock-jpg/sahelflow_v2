import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { nextOrderNumber } from "@/lib/data/service-base";
import { dzPhone } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

// ─── Rate limiting (D-006) ───────────────────────────────────────────────────
// Simple in-memory IP-based rate limiter. Limits per-IP because storefronts
// are public (especially the future Cloudflare Pages deployment). Without
// this, a malicious actor can spam thousands of garbage orders, exhaust
// order-number space, and pollute the seller's dashboard.
//
// 5 submissions per minute per IP — generous enough for a real customer
// who's retrying after a typo, tight enough to stop spam.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

// Periodically clean up expired entries (every 5 min) to prevent memory leak
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of ipHits) {
      if (now > entry.resetAt) ipHits.delete(ip);
    }
  }, 300_000).unref?.();
}

const submitSchema = z.object({
  slug: z.string().min(1),
  customer: z.object({
    name: z.string().min(1).max(100),
    phone: dzPhone,
    wilaya: z.string().min(1),
    commune: z.string().min(1),
    address: z.string().min(1).max(500),
  }),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(99),
  })).min(1),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/storefront/submit — public order placement from a storefront.
 *
 * Creates a customer (or finds by phone) + creates a draft order with
 * source="storefront". The seller sees it in their orders list + dashboard.
 *
 * Rate limited: 5 submissions/minute per IP (D-006).
 * Transactional: customer find-or-create + order create are atomic (D-007).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Rate limit check
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")?.trim()
    ?? "unknown";
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Trop de commandes. Veuillez réessayer dans un instant." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const body = await req.json();
  const input = submitSchema.parse(body);

  // Verify the storefront exists + is active
  const { storefrontService } = await import("@/lib/storefront/service");
  const config = await storefrontService.getBySlug(input.slug);
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "Storefront introuvable ou inactif" }, { status: 404 });
  }

  // Fetch the products (validate they're in the storefront + get prices)
  const products = await db.product.findMany({
    where: {
      id: { in: input.items.map((i) => i.productId) },
      isActive: true,
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Validate all items are in the storefront's product list
  for (const item of input.items) {
    if (!config.productIds.includes(item.productId)) {
      return NextResponse.json(
        { error: `Produit non disponible dans cette boutique` },
        { status: 400 },
      );
    }
    if (!productMap.has(item.productId)) {
      return NextResponse.json({ error: "Produit introuvable" }, { status: 400 });
    }
  }

  // Build order items
  const orderItems = input.items.map((item) => {
    const product = productMap.get(item.productId)!;
    return {
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      total: product.price * item.quantity,
    };
  });

  const total = orderItems.reduce((sum, i) => sum + i.total, 0);

  // Generate order number atomically (D-005: was racy count()+1)
  const orderNumber = await nextOrderNumber(db);

  // Create customer + order in a transaction (D-007: was not transactional).
  // Use upsert for idempotency — if two concurrent submissions come in with
  // the same new phone, the second finds the customer the first created.
  const order = await db.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phone: input.customer.phone },
      update: {
        // Update name/address on subsequent orders (customer may have moved)
        name: input.customer.name,
        wilaya: input.customer.wilaya,
        commune: input.customer.commune,
        address: input.customer.address,
      },
      create: {
        name: input.customer.name,
        phone: input.customer.phone,
        wilaya: input.customer.wilaya,
        commune: input.customer.commune,
        address: input.customer.address,
      },
    });

    return tx.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        status: "draft",
        items: { create: orderItems },
        totalPrice: total,
        wilaya: input.customer.wilaya,
        commune: input.customer.commune,
        address: input.customer.address,
        phone: input.customer.phone,
        source: "storefront",
        sourceMetadata: JSON.stringify({ storefrontSlug: input.slug }),
        notes: input.notes,
      },
      include: { items: true },
    });
  });

  return NextResponse.json({
    ok: true,
    orderNumber: order.orderNumber,
    orderId: order.id,
    total: order.totalPrice,
    message: "Commande passée avec succès ! Le vendeur vous contactera bientôt.",
  }, { status: 201 });
}, "POST /api/storefront/submit");
