import "server-only";

/**
 * Abandoned-cart recovery service (FD-061 EX-4, slice 1).
 *
 * Contracts extracted from CodFlow's growth/checkout research
 * (documentation/research/CODFLOW_EXTRACTION.md §6, Apache-2.0), re-scoped
 * onto the desktop storefront:
 *   - per-session capture: name ≥ 2 chars + valid DZ mobile
 *     (^[567]\d{8}$ after 00213/213/0 stripping), upserted per
 *     (storefrontSlug, sessionId);
 *   - the 30-minute sweep marks stale pending rows abandoned (the worker
 *     ticks hourly);
 *   - conversion is terminal and idempotent — the storefront checkout
 *     converts the session's row after the canonical command commits;
 *   - recovery stats include the estimated lost revenue.
 *
 * Money truth stays in the command kernel: item prices here are a snapshot
 * from the live catalog at capture time, used for recovery estimates only.
 * The ledger never mutates Order rows.
 */
import { z } from "zod";

import type { ServiceContext } from "@/lib/data/service-base";
import { isValidDZMobilePhone, normalizeDZPhone } from "@/lib/validation/phone";

export const ABANDONED_CART_SWEEP_AFTER_MS = 30 * 60_000;

export const captureSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().regex(/^[0-9a-f-]{36}$/i, "Invalid session id"),
  name: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(1).max(24),
  wilaya: z.string().trim().min(1).max(120).optional(),
  commune: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        variantId: z.string().min(1).nullable().optional(),
        quantity: z.number().int().positive().max(100),
      }),
    )
    .min(1)
    .max(100),
});

export type AbandonedCartCaptureInput = z.infer<typeof captureSchema>;

export type CaptureDisposition = {
  captured: boolean;
  reason?:
    | "invalid_phone"
    | "storefront_missing_or_inactive"
    | "product_unavailable"
    | "already_converted";
};

/**
 * Canonical captured mobile: 9 digits, `^[567]\d{8}$` (the research
 * contract) — i.e. the DZ mobile without its leading trunk 0.
 */
export function canonicalCapturedPhone(raw: string): string | null {
  const normalized = normalizeDZPhone(raw);
  if (!isValidDZMobilePhone(normalized)) return null;
  return normalized.slice(1);
}

/**
 * Upsert one capture for (slug, sessionId). Re-captures for an active or
 * already-abandoned session refresh the snapshot and re-arm the sweep
 * (capturedAt = now, status = pending); a converted session is terminal and
 * is never resurrected. Prices are resolved from the live catalog; if a
 * product is gone or inactive the capture is skipped (fail-closed for
 * revenue estimates, never for the buyer's checkout).
 */
export async function upsertAbandonedCartCapture(
  context: ServiceContext,
  input: AbandonedCartCaptureInput,
): Promise<CaptureDisposition> {
  const phone = canonicalCapturedPhone(input.phone);
  if (!phone) return { captured: false, reason: "invalid_phone" };

  const config = await context.prisma.storefrontConfig.findUnique({
    where: { slug: input.slug },
    select: { isActive: true },
  });
  if (!config?.isActive) {
    return { captured: false, reason: "storefront_missing_or_inactive" };
  }

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const products = await context.prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true, deletedAt: null },
    select: {
      id: true,
      price: true,
      productVariants: {
        where: { isActive: true },
        select: { id: true, price: true },
      },
    },
  });
  const priceByProduct = new Map(products.map((product) => [product.id, product]));
  let totalPrice = 0;
  for (const item of input.items) {
    const product = priceByProduct.get(item.productId);
    if (!product) return { captured: false, reason: "product_unavailable" };
    const unitPrice = item.variantId
      ? product.productVariants.find((variant) => variant.id === item.variantId)?.price ??
        product.price
      : product.price;
    totalPrice += unitPrice * item.quantity;
  }

  const itemsJson = JSON.stringify(
    input.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? null,
      quantity: item.quantity,
    })),
  );
  const now = new Date();
  const data = {
    customerName: input.name,
    customerPhone: phone,
    wilaya: input.wilaya ?? null,
    commune: input.commune ?? null,
    address: input.address ?? null,
    itemsJson,
    itemCount: input.items.reduce((sum, item) => sum + item.quantity, 0),
    totalPrice,
    status: "pending",
    capturedAt: now,
    abandonedAt: null,
  };

  const existing = await context.prisma.abandonedCart.findUnique({
    where: {
      storefrontSlug_sessionId: {
        storefrontSlug: input.slug,
        sessionId: input.sessionId,
      },
    },
    select: { id: true, status: true },
  });
  if (existing?.status === "converted") {
    return { captured: false, reason: "already_converted" };
  }

  await context.prisma.abandonedCart.upsert({
    where: {
      storefrontSlug_sessionId: {
        storefrontSlug: input.slug,
        sessionId: input.sessionId,
      },
    },
    create: { ...data, storefrontSlug: input.slug, sessionId: input.sessionId },
    update: data,
  });
  return { captured: true };
}

/**
 * The 30-minute sweep: pending rows whose last capture is older than the
 * window become abandoned. Called by the hourly worker; safe to run
 * concurrently (updateMany is idempotent over its where-clause).
 */
export async function markStaleCartsAbandoned(
  context: ServiceContext,
  now: Date = new Date(),
): Promise<number> {
  const result = await context.prisma.abandonedCart.updateMany({
    where: {
      status: "pending",
      capturedAt: { lte: new Date(now.getTime() - ABANDONED_CART_SWEEP_AFTER_MS) },
    },
    data: { status: "abandoned", abandonedAt: now },
  });
  return result.count;
}

/**
 * Convert the session's row after a committed storefront order. Idempotent
 * by construction: the where-clause excludes already-converted rows, so
 * replays and concurrent submits converge on the same terminal state.
 */
export async function convertAbandonedCart(
  context: ServiceContext,
  input: { slug: string; sessionId: string; orderId: string },
): Promise<number> {
  const result = await context.prisma.abandonedCart.updateMany({
    where: {
      storefrontSlug: input.slug,
      sessionId: input.sessionId,
      NOT: { status: "converted" },
    },
    data: {
      status: "converted",
      convertedOrderId: input.orderId,
      convertedAt: new Date(),
    },
  });
  return result.count;
}

export interface AbandonedCartRecoveryStats {
  pending: number;
  abandoned: number;
  converted: number;
  /** Sum of captured totals still sitting in abandoned carts. */
  estimatedLostRevenue: number;
  /** Sum of captured totals that went on to convert. */
  recoveredRevenue: number;
}

export async function getAbandonedCartRecoveryStats(
  context: ServiceContext,
): Promise<AbandonedCartRecoveryStats> {
  const groups = await context.prisma.abandonedCart.groupBy({
    by: ["status"],
    _count: { _all: true },
    _sum: { totalPrice: true },
  });
  const byStatus = new Map(groups.map((group) => [group.status, group]));
  const sumFor = (status: string) => byStatus.get(status)?._sum.totalPrice ?? 0;
  const countFor = (status: string) => byStatus.get(status)?._count._all ?? 0;
  return {
    pending: countFor("pending"),
    abandoned: countFor("abandoned"),
    converted: countFor("converted"),
    estimatedLostRevenue: sumFor("abandoned"),
    recoveredRevenue: sumFor("converted"),
  };
}
