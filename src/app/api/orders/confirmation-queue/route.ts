/** GET /api/orders/confirmation-queue — 2-hour confirmation call queue (Phase 8). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { getConfirmationQueue, getStaleOrderCount } from "@/lib/data/confirmation-queue";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (_req: NextRequest) => {
  await requireAuth();
  const [queue, staleCount] = await Promise.all([
    getConfirmationQueue(),
    getStaleOrderCount(),
  ]);
  return NextResponse.json({ queue, staleCount, total: queue.length });
}, "GET /api/orders/confirmation-queue");
