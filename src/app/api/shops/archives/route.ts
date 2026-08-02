import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import { listNativeShopArchives } from "@/lib/shops/native-lifecycle-archives";

export const dynamic = "force-dynamic";

/** GET /api/shops/archives — owner lifecycle archive projection. */
export const GET = withErrorHandler(async () => {
  const actorContext = await requireTrustedAction("shops.create");
  const archives = listNativeShopArchives().filter(
    (archive) =>
      archive.workspaceId === actorContext.shop.workspaceId &&
      archive.installationId === actorContext.shop.installationId &&
      archive.status === "archived",
  );
  return NextResponse.json({ archives });
}, "GET /api/shops/archives");
