import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getCurrentSessionAuthority,
  requireRecentReauthentication,
} from "@/lib/auth/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getActiveShopId, getRegistry, getShop } from "@/lib/shops";
import {
  enqueueAuthorizedNativeLifecycle,
  registryLifecycleTarget,
} from "@/lib/shops/native-lifecycle-authority";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const renameSchema = z
  .object({ name: z.string().trim().min(1).max(50) })
  .strict();
const deleteSchema = z
  .object({ confirmationShopId: z.string().min(1).max(64) })
  .strict();

/** GET /api/shops/[id] — get the exact current-shop projection. */
export const GET = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> => {
    const { id } = await params;
    await requireTrustedAction("shops.read", { shopId: id });
    const shop = getShop(id);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    return NextResponse.json({ shop });
  },
  "GET /api/shops/[id]",
);

/** PATCH /api/shops/[id] — enqueue stable-identity native rename. */
export const PATCH = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const input = renameSchema.parse(await req.json());
    const registry = getRegistry();
    const target = registryLifecycleTarget(id, registry.shops);
    const operation = await enqueueAuthorizedNativeLifecycle({
      action: "shops.create",
      operation: "rename",
      payload: { operation: "rename", name: input.name },
      target,
    });
    return NextResponse.json(
      { status: "pending", operationId: operation.operationId, targetShopId: id },
      { status: 202 },
    );
  },
  "PATCH /api/shops/[id]",
);

/** DELETE /api/shops/[id] — enqueue owner-reauthenticated native deletion. */
export const DELETE = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const input = deleteSchema.parse(await req.json());
    if (input.confirmationShopId !== id) {
      throw new SahelFlowError(
        "Deletion confirmation must exactly match the target shop",
        "SHOP_DELETE_CONFIRMATION_MISMATCH",
        400,
      );
    }
    if (getActiveShopId() === id) {
      throw new SahelFlowError(
        "Switch to another shop before destructive deletion",
        "SHOP_DELETE_ACTIVE_FORBIDDEN",
        409,
      );
    }

    await requireRecentReauthentication();
    const session = await getCurrentSessionAuthority();
    if (session.status !== "authenticated") {
      throw new SahelFlowError("Unauthorized", "UNAUTHORIZED", 401);
    }

    const registry = getRegistry();
    const target = registryLifecycleTarget(id, registry.shops);
    const operation = await enqueueAuthorizedNativeLifecycle({
      action: "shops.delete",
      operation: "delete",
      payload: {
        operation: "delete",
        confirmationShopId: id,
        reauthenticatedAtUnixMs: session.issuedAt.getTime(),
      },
      target,
      recentOwnerReauthentication: true,
    });
    return NextResponse.json(
      { status: "pending", operationId: operation.operationId, targetShopId: id },
      { status: 202 },
    );
  },
  "DELETE /api/shops/[id]",
);
