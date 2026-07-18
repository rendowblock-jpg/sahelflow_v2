import { NextRequest, NextResponse } from "next/server";
import { unblacklistCustomer } from "@/lib/risk-engine";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/** DELETE /api/risk/blacklist/[customerId] — remove a customer from the blacklist */
export const DELETE = withErrorHandler(async (_req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) => {
  await requireAuth();
  const { customerId } = await params;
  // W2-5: capture before-state (was the customer actually blacklisted?).
  const before = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, isBlacklisted: true, blacklistReason: true, blacklistedAt: true },
  });
  await unblacklistCustomer({ prisma: db, shop: shopContext }, customerId);
  void logAudit({ prisma: db, shop: shopContext }, {
    action: "customer.unblacklisted",
    entity: "customer",
    entityId: customerId,
    actor: "user",
    before: before as Record<string, unknown> | null,
  });
  return NextResponse.json({ ok: true });
}, "DELETE /api/risk/blacklist/[customerId]");
