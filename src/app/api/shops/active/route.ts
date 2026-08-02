import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getRegistry } from "@/lib/shops";
import {
  enqueueAuthorizedNativeLifecycle,
  registryLifecycleTarget,
} from "@/lib/shops/native-lifecycle-authority";

export const dynamic = "force-dynamic";

const setActiveSchema = z
  .object({
    shopId: z.string().trim().min(1).max(64),
  })
  .strict();

/** PUT /api/shops/active — authorize and enqueue an exact native switch. */
export const PUT = withErrorHandler(async (req: NextRequest) => {
  const input = setActiveSchema.parse(await req.json());
  const registry = getRegistry();
  const target = registryLifecycleTarget(input.shopId, registry.shops);
  const operation = await enqueueAuthorizedNativeLifecycle({
    action: "shops.switch",
    operation: "switch",
    payload: { operation: "switch" },
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
}, "PUT /api/shops/active");
