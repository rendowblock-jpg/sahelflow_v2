import "server-only";

/**
 * Fire-and-forget CAPI stage triggers for the order lifecycle (FD-061 EX-3).
 *
 * Each helper self-constructs the desktop ServiceContext and calls
 * queueCapiStage, whose own error boundary guarantees a CAPI failure can
 * never block order or delivery confirmation. Call sites are one-liners
 * placed immediately AFTER the authoritative mutation resolves.
 */

export async function fireCapiStageForOrder(
  orderId: string,
  stage: "checkout" | "confirmed" | "delivered",
  triggeredAt: Date = new Date(),
): Promise<void> {
  try {
    const [{ db, shopContext }, { queueCapiStage }] = await Promise.all([
      import("@/lib/db"),
      import("./capi-authority"),
    ]);
    await queueCapiStage(
      { prisma: db, shop: shopContext },
      { orderId, stage, triggeredAt },
    );
  } catch {
    // Never propagate into the caller's flow (defense in depth on top of
    // queueCapiStage's own boundary).
  }
}
