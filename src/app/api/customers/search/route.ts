/**
 * GET /api/customers/search?q=...&limit=50 — search customers.
 *
 * Searches by name or phone. Returns enriched list with order count,
 * total spent, and risk score for each customer.
 */
import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { customerServiceExtensions } from "@/lib/data";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import { projectCustomerListItemForTrustedActor } from "@/lib/identity/customer-projection";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireTrustedAction("customers.read");
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);

  const contact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
    { shopId: actorContext.shop.shopId },
  );
  if (!contact) {
    return NextResponse.json({
      customers: [],
      total: 0,
      query: q,
      fieldAccess: { contact: false },
    });
  }

  const customers = await customerServiceExtensions.search({ prisma: db, shop: shopContext }, q, { limit, offset });
  return NextResponse.json({
    customers: customers.map((customer) =>
      projectCustomerListItemForTrustedActor(actorContext, customer),
    ),
    total: customers.length,
    query: q,
    fieldAccess: { contact: true },
  });
}, "GET /api/customers/search");
