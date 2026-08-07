import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getConfirmationWorkbenchPage } from "@/lib/orders/confirmation-workbench";

export const dynamic = "force-dynamic";

/** GET /api/orders/confirmation-queue — exact paginated confirmation workbench. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("orders.read");
  const searchParams = req.nextUrl.searchParams;
  const result = await getConfirmationWorkbenchPage(actorContext, {
    page: Number.parseInt(searchParams.get("page") ?? "1", 10),
    pageSize: Number.parseInt(searchParams.get("pageSize") ?? "25", 10),
  });
  return NextResponse.json(result);
}, "GET /api/orders/confirmation-queue");
