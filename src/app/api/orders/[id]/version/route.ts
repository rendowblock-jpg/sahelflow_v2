import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import { NotFoundError } from "@/types/errors";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireAuth();
    const { id } = await params;
    const order = await db.order.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        source: true,
        version: true,
      },
    });
    if (!order) throw new NotFoundError("Order", id);
    return NextResponse.json({ order });
  },
  "GET /api/orders/[id]/version",
);
