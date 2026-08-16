import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { db } from "@/lib/db";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * Permission-filtered customer/order context for the operational Inbox rail.
 * Conversation access never implicitly grants customer, contact, order or
 * financial access; every field family is projected from its exact authority.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, { params }: RouteContext) => {
    const actorContext = await requireTrustedAction("conversations.read");
    const { id: rawId } = await params;
    const conversationId = decodeURIComponent(rawId);
    const resource = { shopId: actorContext.shop.shopId };

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        contactName: true,
        contactPhone: true,
      },
    });
    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const canReadCustomer = trustedActionAllowed(
      actorContext,
      "customers.read",
      resource,
    );
    const canReadContact = trustedActionAllowed(
      actorContext,
      "customers.contact.read",
      resource,
    );
    const canReadOrders = trustedActionAllowed(
      actorContext,
      "orders.read",
      resource,
    );
    const canReadFinancials = trustedActionAllowed(
      actorContext,
      "orders.financials.read",
      resource,
    );

    if (!canReadCustomer || !canReadContact || !conversation.contactPhone) {
      return NextResponse.json({
        customer: null,
        recentOrders: [],
        deliveryRate: null,
        fieldAccess: {
          customer: canReadCustomer,
          contact: canReadContact,
          orders: canReadOrders,
          financials: canReadFinancials,
        },
      });
    }

    const customer = await db.customer.findFirst({
      where: {
        phone: conversation.contactPhone,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        wilaya: true,
        commune: true,
        orderCount: true,
        totalSpent: true,
        riskScore: true,
        isBlacklisted: true,
        blacklistReason: true,
      },
    });

    if (!customer) {
      return NextResponse.json({
        customer: null,
        recentOrders: [],
        deliveryRate: null,
        fieldAccess: {
          customer: true,
          contact: true,
          orders: canReadOrders,
          financials: canReadFinancials,
        },
      });
    }

    const [recentOrders, totalOrders, deliveredOrders] = canReadOrders
      ? await Promise.all([
          db.order.findMany({
            where: { customerId: customer.id, deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 4,
            select: {
              id: true,
              orderNumber: true,
              status: true,
              source: true,
              totalPrice: true,
              createdAt: true,
              deliveredAt: true,
            },
          }),
          db.order.count({
            where: { customerId: customer.id, deletedAt: null },
          }),
          db.order.count({
            where: {
              customerId: customer.id,
              deletedAt: null,
              OR: [{ status: "delivered" }, { deliveredAt: { not: null } }],
            },
          }),
        ])
      : [[], 0, 0] as const;

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        wilaya: customer.wilaya,
        commune: customer.commune,
        orderCount: customer.orderCount,
        totalSpent: canReadFinancials ? customer.totalSpent : null,
        riskScore: customer.riskScore,
        isBlacklisted: customer.isBlacklisted,
        blacklistReason: customer.blacklistReason,
      },
      recentOrders: recentOrders.map((order) => ({
        ...order,
        totalPrice: canReadFinancials ? order.totalPrice : null,
      })),
      deliveryRate:
        totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : null,
      fieldAccess: {
        customer: true,
        contact: true,
        orders: canReadOrders,
        financials: canReadFinancials,
      },
    });
  },
  "GET /api/inbox/context/[id]",
);
