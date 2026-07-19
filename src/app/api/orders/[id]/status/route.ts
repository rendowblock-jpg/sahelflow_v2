import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { updateOrderStatusSchema } from "@/lib/validation";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** PATCH /api/orders/[id]/status — transition order to a new status */
export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const data = updateOrderStatusSchema.parse(body);

    const order = await orderService.updateStatus({ prisma: db, shop: shopContext }, id, data.status);

    return NextResponse.json({ order });
  },
  "PATCH /api/orders/[id]/status",
);
