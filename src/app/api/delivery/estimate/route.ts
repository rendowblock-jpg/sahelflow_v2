import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const estimateSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress"]),
  wilaya: z.string().min(1),
  commune: z.string().optional(),
  weight: z.number().positive().max(50, "Weight must be ≤ 50kg"),
  codAmount: z.number().min(0),
});

/** POST /api/delivery/estimate — estimate delivery cost for a shipment. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
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
}, "POST /api/delivery/estimate");
