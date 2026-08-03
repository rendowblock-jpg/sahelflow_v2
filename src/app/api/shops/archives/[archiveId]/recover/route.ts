import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { getNativeShopArchive } from "@/lib/shops/native-lifecycle-archives";
import { enqueueAuthorizedNativeLifecycle } from "@/lib/shops/native-lifecycle-authority";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/** POST /api/shops/archives/[archiveId]/recover — restore an archived shop. */
export const POST = withErrorHandler(
  async (
    _req: NextRequest,
    { params }: { params: Promise<{ archiveId: string }> },
  ) => {
    await requireTrustedAction("shops.create");
    const { archiveId } = await params;
    const archive = getNativeShopArchive(archiveId);
    if (archive.status !== "archived") {
      throw new SahelFlowError(
        "Only an ordinary archived shop can be recovered",
        "SHOP_ARCHIVE_NOT_RECOVERABLE",
        409,
      );
    }

    const operation = await enqueueAuthorizedNativeLifecycle({
      action: "shops.create",
      operation: "recover",
      payload: { operation: "recover", archiveId },
      target: {
        id: archive.shop.id,
        incarnationId: archive.shop.incarnationId,
      },
    });

    return NextResponse.json(
      {
        status: "pending",
        operationId: operation.operationId,
        targetShopId: archive.shop.id,
        targetShopIncarnationId: archive.shop.incarnationId,
      },
      { status: 202 },
    );
  },
  "POST /api/shops/archives/[archiveId]/recover",
);
