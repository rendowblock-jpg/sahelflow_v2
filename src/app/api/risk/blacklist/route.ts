import { NextRequest, NextResponse } from "next/server";
import { listBlacklistedCustomers, blacklistCustomer } from "@/lib/risk-engine";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { db, shopContext } from "@/lib/db";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

const BLACKLIST_READ_ACTIONS = [
  "risk.read",
  "customers.read",
  "customers.contact.read",
] as const;

const BLACKLIST_WRITE_ACTIONS = [
  "risk.manage",
  "customers.manage",
] as const;

/** GET /api/risk/blacklist — list blacklisted customers */
export async function GET() {
  await requireAuth(BLACKLIST_READ_ACTIONS);
  const customers = await listBlacklistedCustomers({ prisma: db, shop: shopContext });
  return NextResponse.json({ customers });
}

/** POST /api/risk/blacklist — add a customer to the blacklist */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth(BLACKLIST_WRITE_ACTIONS);
  const { customerId, reason } = z.object({ customerId: z.string().min(1), reason: z.string().max(500).optional() }).parse(await req.json());
  const context = { prisma: db, shop: shopContext };
  const before = await db.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      isBlacklisted: true,
      blacklistReason: true,
      blacklistedAt: true,
    },
  });
  await blacklistCustomer(context, customerId, reason);
  if (before) {
    await logAudit(context, {
      action: "customer.blacklisted",
      entity: "customer",
      entityId: customerId,
      actor: trustedActorAuditIdentity(actorContext.actor),
      before: before as Record<string, unknown>,
      after: {
        isBlacklisted: true,
        blacklistReason: reason ?? null,
      },
    });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}, "POST /api/risk/blacklist");
