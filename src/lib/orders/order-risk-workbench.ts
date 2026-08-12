import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  assessRisk,
  getRiskConfig,
  getRiskRules,
  type RiskAssessment,
  type RiskAssessmentInput,
} from "@/lib/risk-engine";

type OrderRiskRow = {
  id: string;
  totalPrice: number;
  wilaya: string;
  commune: string | null;
  address: string | null;
  phone: string;
  source: string;
  createdAt: Date;
  customerId: string;
};

type CustomerOrderHistoryRow = {
  customerId: string;
  status: string;
  totalPrice: number;
  createdAt: Date;
};

/**
 * Orders-list risk projection optimized for a page-sized batch.
 *
 * The canonical risk config/rules + pure scoring engine remain the authority.
 * This helper only replaces the per-row database fan-out that the list
 * workbench used to trigger via buildAssessmentInputFromOrder().
 */
export async function batchAssessOrdersForWorkbench(
  context: ServiceContext,
  orderIds: readonly string[],
): Promise<Map<string, RiskAssessment>> {
  const uniqueOrderIds = [...new Set(orderIds)];
  if (uniqueOrderIds.length === 0) return new Map();

  const db = context.prisma;
  const orders = (await db.order.findMany({
    where: { id: { in: uniqueOrderIds }, deletedAt: null },
    select: {
      id: true,
      totalPrice: true,
      wilaya: true,
      commune: true,
      address: true,
      phone: true,
      source: true,
      createdAt: true,
      customerId: true,
    },
  })) as OrderRiskRow[];

  if (orders.length === 0) return new Map();

  const customerIds = [...new Set(orders.map((order) => order.customerId))];
  const wilayas = [...new Set(orders.map((order) => order.wilaya))];

  const [customerOrders, customers, wilayaProfiles, config, rules] =
    await Promise.all([
      db.order.findMany({
        where: { customerId: { in: customerIds }, deletedAt: null },
        select: {
          customerId: true,
          status: true,
          totalPrice: true,
          createdAt: true,
        },
        orderBy: [{ customerId: "asc" }, { createdAt: "asc" }],
      }) as Promise<CustomerOrderHistoryRow[]>,
      db.customer.findMany({
        where: { id: { in: customerIds }, deletedAt: null },
        select: { id: true, isBlacklisted: true },
      }),
      db.wilayaRiskProfile.findMany({
        where: { wilaya: { in: wilayas } },
        select: {
          wilaya: true,
          riskLevel: true,
          confirmationRate: true,
          returnRate: true,
        },
      }),
      getRiskConfig(context),
      getRiskRules(context),
    ]);

  const ordersByCustomer = new Map<string, CustomerOrderHistoryRow[]>();
  for (const row of customerOrders) {
    const history = ordersByCustomer.get(row.customerId) ?? [];
    history.push(row);
    ordersByCustomer.set(row.customerId, history);
  }

  const customerBlacklist = new Map(
    customers.map((customer) => [customer.id, customer.isBlacklisted] as const),
  );
  const wilayaByName = new Map(
    wilayaProfiles.map((profile) => [profile.wilaya, profile] as const),
  );

  const results = new Map<string, RiskAssessment>();
  for (const order of orders) {
    const history = ordersByCustomer.get(order.customerId) ?? [];
    const totalOrders = history.length;
    const deliveredCount = history.filter(
      (entry) => entry.status === "delivered",
    ).length;
    const returnedCount = history.filter(
      (entry) => entry.status === "returned",
    ).length;
    const refusedCount = history.filter(
      (entry) => entry.status === "refused",
    ).length;
    const cancelledCount = history.filter(
      (entry) => entry.status === "cancelled",
    ).length;
    const totalSpent = history
      .filter((entry) => !["cancelled", "draft"].includes(entry.status))
      .reduce((sum, entry) => sum + entry.totalPrice, 0);
    const wilayaProfile = wilayaByName.get(order.wilaya);

    const input: RiskAssessmentInput = {
      order: {
        totalPrice: order.totalPrice,
        wilaya: order.wilaya,
        commune: order.commune,
        address: order.address,
        phone: order.phone,
        source: order.source,
        createdAt: order.createdAt,
      },
      customerHistory: {
        customerId: order.customerId,
        totalOrders,
        deliveredCount,
        returnedCount,
        refusedCount,
        cancelledCount,
        totalSpent,
        firstOrderDate: totalOrders > 0 ? history[0]!.createdAt : null,
        lastOrderDate:
          totalOrders > 0 ? history[history.length - 1]!.createdAt : null,
        isBlacklisted: customerBlacklist.get(order.customerId) ?? false,
      },
      wilayaRisk: wilayaProfile
        ? {
            riskLevel: wilayaProfile.riskLevel,
            confirmationRate: wilayaProfile.confirmationRate ?? 0,
            returnRate: wilayaProfile.returnRate ?? 0,
          }
        : null,
    };

    results.set(order.id, assessRisk(input, config, rules));
  }

  return results;
}
