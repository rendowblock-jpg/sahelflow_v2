import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH — Toggle automation active/inactive or update config */
export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();

  const automation = await db.automation.update({
    where: { id },
    data: {
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.name && { name: body.name }),
    },
  });

  return NextResponse.json({ automation });
}, "PATCH /api/automations/[id]");

/** DELETE — Remove an automation */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  // Soft-delete (Automation has deletedAt). Hard-deleting would cascade-wipe
  // AutomationLog rows and lose the execution audit trail (C-audit S2-8).
  await db.automation.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  return NextResponse.json({ success: true });
}, "DELETE /api/automations/[id]");
