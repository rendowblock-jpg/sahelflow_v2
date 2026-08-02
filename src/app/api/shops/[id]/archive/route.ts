import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getRegistry } from "@/lib/shops";
import {
  enqueueAuthorizedNativeLifecycle,
  registryLifecycleTarget,
} from "@/lib/shops/native-lifecycle-authority";

export const dynamic = "force-dynamic";

/** POST /api/shops/[id]/archive — preserve and remove one shop natively. */
export const POST = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await params;
    const registry = getRegistry();
    const target = registryLifecycleTarget(id, registry.shops);
    const operation = await enqueueAuthorizedNativeLifecycle({
      action: "shops.delete",
      operation: "archive",
      payload: { operation: "archive" },
      target,
    });

    return NextResponse.json(
      {
        status: "pending",
        operationId: operation.operationId,
        targetShopId: target.id,
        targetShopIncarnationId: target.incarnationId,
      },
      { status: 202 },
    );
  },
  "POST /api/shops/[id]/archive",
);
