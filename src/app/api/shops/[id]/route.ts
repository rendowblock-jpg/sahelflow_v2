import { NextRequest, NextResponse } from "next/server";
import { deleteShop, getShop, getActiveShopId } from "@/lib/shops";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  requireTrustedAction,
  trustedActorAuditIdentity,
} from "@/lib/identity/authorization";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/shops/[id] — get a single shop. */
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

/** DELETE /api/shops/[id] — remove a shop and quarantine its SQLite file.
 *
 * Session 30 (AUDIT-2 A8): requires { confirm: "DELETE" } body. Also
 * refuses to delete the active shop (the user must switch first).
 */
export const DELETE = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const actorContext = await requireTrustedAction("shops.delete", { shopId: id });
    const shop = getShop(id);
    if (!shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    // Require explicit confirm body
    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "DELETE") {
      return NextResponse.json(
        { error: "Confirm required: send { confirm: 'DELETE' } to acknowledge this destructive operation" },
        { status: 400 },
      );
    }
    // Refuse to delete the active shop
    if (getActiveShopId() === id) {
      return NextResponse.json(
        { error: "Cannot delete the active shop — switch to another shop first" },
        { status: 400 },
      );
    }
    deleteShop(id);
    // The database is quarantined for explicit retention cleanup rather than
    // permanently unlinked inside this request.
    // `shop` was fetched above (used for the 404 check + active-shop guard).
    void logAudit({ prisma: db, shop: shopContext }, {
      action: "shop.deleted",
      entity: "shop",
      entityId: id,
      actor: trustedActorAuditIdentity(actorContext.actor),
      before: shop as unknown as Record<string, unknown> | null,
    });
    return NextResponse.json({ ok: true });
  },
  "DELETE /api/shops/[id]",
);
