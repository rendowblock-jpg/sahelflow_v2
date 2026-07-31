/** GET /api/orders/confirmation-queue — 2-hour confirmation call queue. */
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRouteAuth } from "@/lib/auth/route-authority";
import {
  getConfirmationQueue,
  getStaleOrderCount,
} from "@/lib/data/confirmation-queue";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireRouteAuth(req);
  const [queue, staleCount] = await Promise.all([
    getConfirmationQueue(),
    getStaleOrderCount(),
  ]);
  return NextResponse.json({ queue, staleCount, total: queue.length });
}, "GET /api/orders/confirmation-queue");
