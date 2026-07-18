import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { dzPhone } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

// ─── Rate limiting (D-006) ───────────────────────────────────────────────────
// Simple in-memory IP-based rate limiter. Limits per-IP because storefronts
// are public (especially the future Cloudflare Pages deployment). Without
// this, a malicious actor can spam thousands of garbage orders, exhaust
// order-number space, and pollute the seller's dashboard.
//
// W3-13: window widened from 1 min → 10 min (max 5 submissions per IP per
// 10-minute window). A real customer rarely places >5 orders in 10 min; a
// bot spammer hits the wall fast. Combined with the honeypot + Turnstile
// (non-Tauri), this is defense-in-depth.
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
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

// ─── Spam protection: honeypot + Turnstile (W3-13) ──────────────────────────
//
// Honeypot: a visually-hidden "website" field added to the storefront form.
// Real customers never see it (CSS hides it off-screen); bots that
// indiscriminately fill all form fields will populate it. If non-empty, we
// silently return 201 (so the bot thinks it succeeded) without creating an
// order — no DB write, no rate-limit consumption on subsequent honeypot
// hits, no tip-off.
//
// Turnstile (non-Tauri only): the Tauri desktop app doesn't need a CAPTCHA
// (the seller is the only user). For web deployments (Cloudflare Pages),
// Cloudflare Turnstile verifies the client is human. Detection: the Tauri
// webview sends a User-Agent containing "tauri" (case-insensitive); we also
// accept an x-sf-tauri header as a fallback. If NOT Tauri AND
// TURNSTILE_SECRET_KEY is set, require a valid cf-turnstile-response token.
// If TURNSTILE_SECRET_KEY is NOT set, skip Turnstile (graceful degradation
// — honeypot + rate-limit still apply).

/** Detect whether the request originates from the Tauri desktop shell. */
function isTauriRequest(req: NextRequest): boolean {
  // Explicit header (set by the Tauri Rust gateway in production).
  if (req.headers.get("x-sf-tauri") === "1") return true;
  const ua = req.headers.get("user-agent") ?? "";
  return /tauri/i.test(ua);
}

/**
 * Verify a Cloudflare Turnstile token via the siteverify endpoint.
 * Returns true if the token is valid. Failures (network error, invalid
 * token, etc.) return false — the caller returns 400.
 */
async function verifyTurnstileToken(
  token: string,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured → skip (graceful degradation)
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: ip,
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    // Network error / timeout — fail closed (reject). A transient network
    // blip would block the submission, but that's safer than accepting an
    // unverified token. The customer can retry.
    return false;
  }
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
  // W3-13: honeypot field — bots fill this, real customers never see it.
  // Must be empty for a legitimate submission. Checked before any DB work.
  website: z.string().max(1000).optional(),
  // W3-13: Cloudflare Turnstile token (non-Tauri web deployments only).
  // Undefined/empty in Tauri (no widget rendered) and when Turnstile is
  // not configured.
  "cf-turnstile-response": z.string().max(2048).optional(),
});

/**
 * POST /api/storefront/submit — public order placement from a storefront.
 *
 * Creates a customer (or finds by phone) + creates a draft order with
 * source="storefront". The seller sees it in their orders list + dashboard.
 *
 * Spam protection (W3-13):
 *   - Honeypot: hidden "website" field; if non-empty → silent 201 (no order).
 *   - Rate limited: 5 submissions / 10 min per IP (D-006).
 *   - Turnstile: required for non-Tauri requests when TURNSTILE_SECRET_KEY
 *     is set (web deployment); skipped in Tauri + when not configured.
 *
 * Transactional: customer find-or-create + order create are atomic (D-007).
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  // Resolve IP up-front (used for rate limit + Turnstile remoteip).
  // SEC-022: prefer CF-Connecting-IP (set by Cloudflare, not spoofable) over
  // X-Forwarded-For (client-controlled). For Tauri local-first, the gateway
  // sets x-forwarded-for from the actual socket — acceptable. For Cloudflare
  // Pages, CF-Connecting-IP is the verified client IP.
  const ip = req.headers.get("cf-connecting-ip")?.trim()
    ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")?.trim()
    ?? "unknown";

  const body = await req.json();
  const input = submitSchema.parse(body);

  // ── Honeypot check (W3-13) ──────────────────────────────────────────────
  // If the hidden "website" field is non-empty, this is a bot. Silently
  // return 201 (success) so the bot thinks it worked — but don't create
  // any order or consume further resources. No rate-limit consumption so
  // a bot that always fills the honeypot can't DoS the rate limiter for
  // real customers.
  if (input.website && input.website.trim().length > 0) {
    return NextResponse.json({
      ok: true,
      orderNumber: "HP-" + Date.now().toString(36),
      orderId: null,
      total: 0,
      message: "Order placed successfully! The seller will contact you soon.",
    }, { status: 201 });
  }

  // ── Rate limit check ────────────────────────────────────────────────────
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many orders. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  // ── Turnstile verification (non-Tauri only, W3-13) ──────────────────────
  // Tauri desktop app: skip (the seller is the only user, no CAPTCHA needed).
  // Web deployment: if TURNSTILE_SECRET_KEY is set, require a valid token.
  // If not set, skip (graceful degradation — honeypot + rate-limit still apply).
  if (!isTauriRequest(req) && process.env.TURNSTILE_SECRET_KEY) {
    const turnstileToken = input["cf-turnstile-response"];
    if (!turnstileToken || turnstileToken.trim().length === 0) {
      return NextResponse.json(
        { error: "Anti-bot verification required. Please complete the challenge." },
        { status: 400 },
      );
    }
    const valid = await verifyTurnstileToken(turnstileToken, ip);
    if (!valid) {
      return NextResponse.json(
        { error: "Anti-bot verification failed. Please try again." },
        { status: 400 },
      );
    }
  }

  // Verify the storefront exists + is active
  const { storefrontService } = await import("@/lib/storefront/service");
  const config = await storefrontService.getBySlug(
    { prisma: db, shop: shopContext },
    input.slug,
  );
  if (!config || !config.isActive) {
    return NextResponse.json({ error: "Storefront not found or inactive" }, { status: 404 });
  }

  // Fetch the products (validate they're in the storefront + get prices)
  const products = await db.product.findMany({
    where: {
      id: { in: input.items.map((i) => i.productId) },
      isActive: true,
      deletedAt: null,
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
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }
  }

  // Build order items (schema shape — no `total`, the service computes it).
  const orderItems = input.items.map((item) => {
    const product = productMap.get(item.productId)!;
    return {
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
    };
  });

  // Create customer + order in a transaction (D-007: was not transactional).
  // Use upsert for idempotency — if two concurrent submissions come in with
  // the same new phone, the second finds the customer the first created.
  //
  // SV-M12: the upsert's `update` branch now clears `deletedAt: null`. The
  // Customer model has a blind index on `phone` (so it's findable by phone
  // regardless of soft-delete state), which means a `customer.upsert({ where:
  // { phone } })` finds soft-deleted rows too — previously, a storefront
  // submission for a phone that was soft-deleted would link the new order to
  // a "deleted" customer (the seller wouldn't see it in their customer list
  // because the customer list filters deletedAt:null). Clearing deletedAt in
  // the update branch "restores" the customer — they're now active again,
  // linked to the new order + their historical orders. (Prisma upsert
  // doesn't support a `where` filter on non-unique fields like deletedAt, so
  // we can't filter the lookup — the update branch is the only place to
  // clear it.)
  //
  // Phase 1 bug 1.3: route the order.create through orderService.create so
  // storefront orders get the OrderChange "created" ledger entry + the
  // `order.created` automation trigger (same as manual UI orders). The
  // service runs inside this tx (opts.tx) so customer-upsert + order-create
  // + ledger entry all stay atomic.
  const context = { prisma: db, shop: shopContext };
  const order = await context.prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phone: input.customer.phone },
      update: {
        // Update name/address on subsequent orders (customer may have moved)
        name: input.customer.name,
        wilaya: input.customer.wilaya,
        commune: input.customer.commune,
        address: input.customer.address,
        // SV-M12: restore the customer if they were soft-deleted. Without
        // this, the order would be linked to a "deleted" customer invisible
        // in the customer list.
        deletedAt: null,
      },
      create: {
        name: input.customer.name,
        phone: input.customer.phone,
        wilaya: input.customer.wilaya,
        commune: input.customer.commune,
        address: input.customer.address,
      },
    });

    return orderService.create(
      { prisma: db, shop: shopContext },
      {
        customerId: customer.id,
        items: orderItems,
        wilaya: input.customer.wilaya,
        commune: input.customer.commune,
        address: input.customer.address,
        phone: input.customer.phone,
        source: "storefront",
        sourceMetadata: { storefrontSlug: input.slug },
        notes: input.notes,
      },
      { tx: tx as never },
    );
  });

  return NextResponse.json({
    ok: true,
    orderNumber: order.orderNumber,
    orderId: order.id,
    total: order.totalPrice,
    message: "Order placed successfully! The seller will contact you soon.",
  }, { status: 201 });
}, "POST /api/storefront/submit");
