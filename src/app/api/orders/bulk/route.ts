/**
 * POST /api/orders/bulk — bulk transition multiple orders to a new status.
 *
 * Body: { ids: string[], status: OrderStatus }
 * Response: { succeeded: string[], failed: [{id, error}] }
 *
 * Each order is validated individually via orderService.updateStatus
 * (which enforces the state machine + stock side effects). Valid orders
 * transition; invalid ones are reported without blocking the rest.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { orderServiceExtensions } from "@/lib/data";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import type { OrderStatus } from "@/types/domain";
import { requireTrustedAction } from "@/lib/identity/authorization";

const VALID_STATUSES: OrderStatus[] = [
  "pending", "confirmed", "shipped", "delivered", "returned", "refused", "cancelled",
];

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  status: z.enum(VALID_STATUSES as [string, ...string[]]),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireTrustedAction("orders.update");
  const body = await req.json();
  const { ids, status } = bulkSchema.parse(body);

  const result = await orderServiceExtensions.bulkUpdateStatus(
    { prisma: db, shop: shopContext },
    ids,
    status as OrderStatus,
  );

  return NextResponse.json(result);
}, "POST /api/orders/bulk");
