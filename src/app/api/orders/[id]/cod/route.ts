/** PATCH /api/orders/[id]/cod — update COD reconciliation status (Phase 4). */
import { NextRequest, NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { markCodCollected, markCodRemitted } from "@/lib/data/cod-service";
import { z } from "zod";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const codSchema = z.object({
  action: z.enum(["mark_collected", "mark_remitted"]),
  remittanceRef: z.string().optional(),
});

export const PATCH = withErrorHandler(async (req: NextRequest, { params }: Ctx) => {
  await requireAuth();
  const { id } = await params;
  const body = await req.json();
  const parsed = codSchema.parse(body);

  const order = parsed.action === "mark_collected"
    ? await markCodCollected(id)
    : await markCodRemitted(id, parsed.remittanceRef ?? "");

  return NextResponse.json({ order });
}, "PATCH /api/orders/[id]/cod");
