import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDeliveryAdapter, loadDeliveryCredentials } from "@/lib/integrations/delivery";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { assertProviderCapability } from "@/lib/integrations/delivery/provider-capability";

export const dynamic = "force-dynamic";

const estimateSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress", "ecotrack"]),
  wilaya: z.string().min(1),
  commune: z.string().optional(),
  weight: z.number().positive().max(50, "Weight must be at most 50kg"),
  codAmount: z.number().min(0),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth(["deliveries.manage", "customers.contact.read", "orders.financials.read"]);
  const input = estimateSchema.parse(await req.json());
  const context = { prisma: db, shop: shopContext };
  await assertProviderCapability(context, input.provider, "fees");
  const adapter = getDeliveryAdapter(input.provider);
  const credentials = await loadDeliveryCredentials(context, input.provider);
  return NextResponse.json(await adapter.estimateCost({
    wilaya: input.wilaya,
    commune: input.commune,
    weight: input.weight,
    codAmount: input.codAmount,
  }, credentials));
}, "POST /api/delivery/estimate");
