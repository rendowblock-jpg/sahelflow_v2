import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderService } from "@/lib/data/order-service";
import { updateOrderStatusSchema } from "@/lib/validation";
import { SahelFlowError } from "@/types/errors";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** PATCH /api/orders/[id]/status — transition order to a new status */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data = updateOrderStatusSchema.parse(body);

    const order = await orderService.updateStatus({ prisma: db }, id, data.status);

    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof SahelFlowError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      );
    }
    console.error("[PATCH /api/orders/[id]/status] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
