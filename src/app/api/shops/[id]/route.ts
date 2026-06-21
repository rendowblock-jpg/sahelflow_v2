import { NextRequest, NextResponse } from "next/server";
import { deleteShop, getShop } from "@/lib/shops";

export const dynamic = "force-dynamic";

/** GET /api/shops/[id] — get a single shop. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const shop = getShop(id);
  if (!shop) {
    return NextResponse.json({ error: "Shop introuvable" }, { status: 404 });
  }
  return NextResponse.json({ shop });
}

/** DELETE /api/shops/[id] — delete a shop + its SQLite file. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const shop = getShop(id);
    if (!shop) {
      return NextResponse.json({ error: "Shop introuvable" }, { status: 404 });
    }
    deleteShop(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
