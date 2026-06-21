import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";

export const dynamic = "force-dynamic";

const estimateSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress"]),
  wilaya: z.string().min(1),
  commune: z.string().optional(),
  weight: z.number().positive().max(50, "Weight must be ≤ 50kg"),
  codAmount: z.number().min(0),
});

/** POST /api/delivery/estimate — estimate delivery cost for a shipment. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = estimateSchema.parse(body);

    const adapter = getDeliveryAdapter(input.provider);
    const creds = await loadDeliveryCredentials(input.provider);

    const estimate = await adapter.estimateCost(
      {
        wilaya: input.wilaya,
        commune: input.commune,
        weight: input.weight,
        codAmount: input.codAmount,
      },
      creds,
    );

    return NextResponse.json(estimate);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[POST /api/delivery/estimate]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
