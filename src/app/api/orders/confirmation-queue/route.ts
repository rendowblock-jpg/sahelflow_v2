/** GET /api/orders/confirmation-queue — 2-hour confirmation call queue. */
import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";
import {
  getConfirmationQueue,
  getStaleOrderCount,
} from "@/lib/data/confirmation-queue";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  void req;
  const actorContext = await requireTrustedAction("orders.read");
  const contact = trustedActionAllowed(
    actorContext,
    "customers.contact.read",
  );
  const financials = trustedActionAllowed(
    actorContext,
    "orders.financials.read",
  );
  const [queue, staleCount] = await Promise.all([
    getConfirmationQueue(),
    getStaleOrderCount(),
  ]);
  const projectedQueue = queue.map((order) => ({
    ...order,
    totalPrice: financials ? order.totalPrice : null,
    phone: contact ? order.phone : null,
    customer: order.customer
      ? {
          ...order.customer,
          name: contact ? order.customer.name : null,
          phone: contact ? order.customer.phone : null,
        }
      : null,
    fieldAccess: { contact, financials },
  }));
  return NextResponse.json({
    queue: projectedQueue,
    staleCount,
    total: projectedQueue.length,
  });
}, "GET /api/orders/confirmation-queue");
