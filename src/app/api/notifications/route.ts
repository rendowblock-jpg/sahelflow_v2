import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/notifications — list notifications (unread first, then by date). */
export async function GET(req: NextRequest) {
  try {
    const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
    const limit = Math.min(
      Number(req.nextUrl.searchParams.get("limit") ?? "50"),
      200,
    );

    const notifications = await db.notification.findMany({
      where: unreadOnly ? { read: false } : {},
      orderBy: [{ read: "asc" }, { createdAt: "desc" }],
      take: limit,
    });

    const unreadCount = await db.notification.count({ where: { read: false } });

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    console.error("[GET /api/notifications]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** POST /api/notifications — mark a notification as read (body: { id } | { markAll: true }). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    if (body.markAll === true) {
      const result = await db.notification.updateMany({
        where: { read: false },
        data: { read: true },
      });
      return NextResponse.json({ ok: true, marked: result.count });
    }

    const id = body.id as string | undefined;
    if (!id) {
      return NextResponse.json({ error: "id required (or markAll: true)" }, { status: 400 });
    }

    await db.notification.update({
      where: { id },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/notifications]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** DELETE /api/notifications — delete all read notifications (or all if ?all=true). */
export async function DELETE(req: NextRequest) {
  try {
    const all = req.nextUrl.searchParams.get("all") === "true";
    const where = all ? {} : { read: true };
    const result = await db.notification.deleteMany({ where });
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    console.error("[DELETE /api/notifications]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
