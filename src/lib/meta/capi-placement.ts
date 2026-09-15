import "server-only";

/**
 * Best-effort Meta attribution capture for adopted storefront orders
 * (FD-061 EX-3). fbc/fbp ride the Meta cookie contract; clientIp/userAgent
 * come from the checkout request headers.
 *
 * The write is a documented side-channel onto the Order attribution columns
 * (classified in the Phase 4 inventory as plaintext-at-rest, forwarded
 * verbatim to Meta CAPI) — never money truth. Every failure is swallowed so
 * the checkout response never depends on placement capture, and the CAPI
 * drain reads the columns at send time, so there is no queue-time snapshot
 * race with this write.
 */

export interface OrderPlacement {
  fbc?: string | null;
  fbp?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}

/**
 * Persist whatever placement signals are present onto the order. Fire-and-
 * forget: resolves (never rejects) even when the write fails, so callers can
 * chain the checkout CAPI trigger deterministically after it.
 */
export async function captureOrderPlacement(
  orderId: string,
  placement: OrderPlacement,
): Promise<void> {
  try {
    const { db } = await import("@/lib/db");
    const data = {
      ...(placement.fbc ? { fbc: placement.fbc } : {}),
      ...(placement.fbp ? { fbp: placement.fbp } : {}),
      ...(placement.clientIp ? { clientIp: placement.clientIp } : {}),
      ...(placement.userAgent ? { userAgent: placement.userAgent } : {}),
    };
    if (Object.keys(data).length === 0) return;
    await db.order.update({
      where: { id: orderId },
      data,
      select: { id: true },
    });
  } catch {
    // Placement capture is best-effort; the checkout response never depends
    // on it (defense in depth mirroring fireCapiStageForOrder).
  }
}
