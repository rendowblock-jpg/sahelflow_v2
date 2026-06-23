import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/** POST — Create a new automation */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, trigger, action, isActive } = body;

    if (!name || !trigger || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const automation = await db.automation.create({
      data: {
        name,
        trigger,
        action,
        isActive: isActive ?? true,
        runCount: 0,
      },
    });

    return NextResponse.json({ automation }, { status: 201 });
  } catch (error) {
    console.error("POST /api/automations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** GET — List all automations */
export async function GET() {
  try {
    const automations = await db.automation.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ automations });
  } catch (error) {
    console.error("GET /api/automations error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
