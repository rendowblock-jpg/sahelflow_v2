import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db, shopContext } from "@/lib/db";
import { synchronizeCanonicalCourierTracking } from "@/lib/delivery/canonical-courier";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireTrustedActor();
    const { id } = await params;
    const result = await synchronizeCanonicalCourierTracking(
      { prisma: db, shop: shopContext },
      id,
    );
    return NextResponse.json(result);
  },
  "POST /api/orders/[id]/courier/sync",
);
