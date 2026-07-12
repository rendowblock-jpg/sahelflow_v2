import { NextRequest, NextResponse } from "next/server";
import { deleteShop, getShop, getActiveShopId } from "@/lib/shops";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** GET /api/shops/[id] — get a single shop. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  await requireAuth();
  const { id } = await params;
  const shop = getShop(id);
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }
  return NextResponse.json({ shop });
}

/** DELETE /api/shops/[id] — delete a shop + its SQLite file.
 *
 * Session 30 (AUDIT-2 A8): requires { confirm: "DELETE" } body. Also
 * refuses to delete the active shop (the user must switch first).
 */
export const DELETE = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    await requireAuth();
    const { id } = await params;
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
    // W2-5: audit shop deletion — destructive (SQLite file is permanently deleted).
    // `shop` was fetched above (used for the 404 check + active-shop guard).
    void logAudit({
      action: "shop.deleted",
      entity: "shop",
      entityId: id,
      actor: "user",
      before: shop as unknown as Record<string, unknown> | null,
    });
    return NextResponse.json({ ok: true });
  },
  "DELETE /api/shops/[id]",
);
