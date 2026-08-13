import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { getDeliveryWorkbenchPage } from "@/lib/deliveries/delivery-workbench";

export const dynamic = "force-dynamic";

/** GET /api/delivery — canonical permission-aware delivery workbench. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("deliveries.read");
  const searchParams = req.nextUrl.searchParams;
  const result = await getDeliveryWorkbenchPage(actorContext, {
    page: Number.parseInt(searchParams.get("page") ?? "1", 10),
    pageSize: Number.parseInt(searchParams.get("pageSize") ?? "25", 10),
    status: searchParams.get("status") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  return NextResponse.json(result);
}, "GET /api/delivery");
