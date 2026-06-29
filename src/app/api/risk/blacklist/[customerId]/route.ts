import { NextRequest, NextResponse } from "next/server";
import { unblacklistCustomer } from "@/lib/risk-engine";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** DELETE /api/risk/blacklist/[customerId] — remove a customer from the blacklist */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  await unblacklistCustomer(customerId);
  return NextResponse.json({ ok: true });
}, "DELETE /api/risk/blacklist/[customerId]");
