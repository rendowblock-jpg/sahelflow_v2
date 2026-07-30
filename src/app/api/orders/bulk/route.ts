/**
 * POST /api/orders/bulk — bulk transition multiple compatibility orders.
 *
 * Canonical confirmation is deliberately excluded: each confirmation requires
 * its own stable idempotency key, expected version and trusted approval.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { orderServiceExtensions } from "@/lib/data";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import type { OrderStatus } from "@/types/domain";
import { requireAuth } from "@/lib/auth/server";

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "shipped",
  "delivered",
  "returned",
  "refused",
  "cancelled",
];

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  status: z.enum(VALID_STATUSES as [string, ...string[]]),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const { ids, status } = bulkSchema.parse(body);

  const result = await orderServiceExtensions.bulkUpdateStatus(
    { prisma: db, shop: shopContext },
    ids,
    status as OrderStatus,
  );

  return NextResponse.json(result);
}, "POST /api/orders/bulk");
