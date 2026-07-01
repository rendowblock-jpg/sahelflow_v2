/**
 * PATCH /api/returns/[id] — update return status (requested → approved → completed / rejected)
 *
 * Body: { status: "approved" | "rejected" | "completed" }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { SahelFlowError } from "@/types/errors";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const returnStatusSchema = z.object({
  status: z.enum(["approved", "rejected", "completed"]),
  notes: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: RouteContext) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const { status, notes } = returnStatusSchema.parse(body);

  // Verify the return exists
  const existing = await db.return.findUnique({ where: { id } });
  if (!existing) {
    throw new SahelFlowError("Return not found", "NOT_FOUND", 404);
  }

  // Validate the transition
  const currentStatus = existing.status;
  const ALLOWED: Record<string, string[]> = {
    requested: ["approved", "rejected"],
    approved: ["completed", "rejected"],
    rejected: [],
    completed: [],
  };
  const allowed = ALLOWED[currentStatus] ?? [];
  if (!allowed.includes(status)) {
    throw new SahelFlowError(
      `Cannot transition from ${currentStatus} to ${status}`,
      "CONFLICT",
      409,
    );
  }

  // Update the return
  const updated = await db.return.update({
    where: { id },
    data: { status },
  });

  // If notes provided, create a return note
  if (notes) {
    await db.returnNote.create({
      data: {
        returnId: id,
        body: notes,
      },
    });
  }

  return NextResponse.json({ return: updated });
}, "PATCH /api/returns/[id]");
