import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

/** POST — Create a new automation */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
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
}, "POST /api/automations");

/** GET — List all automations */
export const GET = withErrorHandler(async () => {
  const automations = await db.automation.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ automations });
}, "GET /api/automations");
