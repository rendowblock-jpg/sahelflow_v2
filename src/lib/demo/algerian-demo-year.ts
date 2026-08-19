import "server-only";

import { db, type DbClient } from "@/lib/db";
import {
  ALGERIAN_DEMO_HISTORY_DAYS,
  algerianDemoReferenceNow,
  demoDaysAfter,
  demoDaysBefore,
  demoHoursAfter,
} from "@/lib/demo/algerian-demo-clock";

export const ALGERIAN_DEMO_WORKSPACE_VERSION =
  "algerian-cod-founder-v2-annual";

const DEMO_PREFIX = "demo-";
const BASE_ORDER_COUNT = 48;
const PEAK_MONTHS = new Set([2, 3, 6, 8, 11]); // Mar/Apr, Jul, Sep, Dec.
const PROVIDERS = ["yalidine", "zrexpress", "maystro"] as const;
const SOURCES = [
  "whatsapp",
  "storefront",
  "manual",
  "youcan",
  "woocommerce",
] as const;
const HISTORICAL_STATUSES = [
  "delivered",
  "delivered",
  "delivered",
  "delivered",
  "returned",
  "refused",
  "cancelled",
] as const;

function historicalOrderAges(reference: Date): number[] {
  const ages: number[] = [];
  let age = 35;
  let sequence = 0;

  // Roughly one order every 2–3 days over the older eleven months, plus a
  // restrained second order on selected peak-period days. Recent activity is
  // already supplied by the base 0–34 day story, so the combined workspace has
  // a dense present-day surface without fabricating an unrealistically uniform
  // year.
  while (age <= ALGERIAN_DEMO_HISTORY_DAYS - 1) {
    ages.push(age);
    const month = demoDaysBefore(reference, age).getMonth();
    if (PEAK_MONTHS.has(month) && sequence % 5 === 0) {
      ages.push(age);
    }
    age += sequence % 3 === 0 ? 2 : 3;
    sequence += 1;
  }

  const oldest = ALGERIAN_DEMO_HISTORY_DAYS - 1;
  if (!ages.includes(oldest)) ages.push(oldest);
  return ages.sort((left, right) => left - right);
}

function campaignFor(date: Date): string {
  const month = date.getMonth();
  if (month === 8) return "Rentrée & organisation";
  if (month === 6 || month === 7) return "Été COD";
  if (month === 2 || month === 3) return "Maison & cadeaux saisonniers";
  if (month === 10 || month === 11) return "Fin d'année cadeaux";
  return "Catalogue evergreen";
}

function expensePlan(reference: Date) {
  const rows: Array<{
    id: string;
    category: string;
    amount: number;
    age: number;
    notes: string;
  }> = [];
  let index = 0;

  // The base seed already covers the current month. Add recurring operating
  // costs through the preceding eleven months so Accounting, profit and trend
  // surfaces reconcile against the same annual order history.
  for (let monthBack = 1; monthBack <= 11; monthBack += 1) {
    const anchorAge = Math.min(364, monthBack * 30 + 5);
    const month = demoDaysBefore(reference, anchorAge).getMonth();
    const seasonalBoost = PEAK_MONTHS.has(month) ? 1.25 : 1;
    const entries = [
      {
        category: "rent",
        amount: 27_000 + (monthBack % 3) * 1_000,
        age: anchorAge,
        notes: "Loyer mensuel espace stockage",
      },
      {
        category: "ads",
        amount: Math.round((12_500 + (monthBack % 4) * 2_250) * seasonalBoost),
        age: Math.min(364, anchorAge + 6),
        notes: `Acquisition Meta — ${campaignFor(demoDaysBefore(reference, anchorAge))}`,
      },
      {
        category: "delivery_fees",
        amount: 7_400 + (monthBack % 5) * 850,
        age: Math.min(364, anchorAge + 12),
        notes: "Frais transporteurs et collecte COD",
      },
      ...(monthBack % 2 === 0
        ? [
            {
              category: "packaging",
              amount: 4_600 + (monthBack % 3) * 700,
              age: Math.min(364, anchorAge + 18),
              notes: "Réassort emballage, étiquettes et consommables",
            },
          ]
        : []),
    ];

    for (const entry of entries) {
      index += 1;
      rows.push({
        id: `demo-expense-year-${String(index).padStart(3, "0")}`,
        ...entry,
      });
    }
  }
  return rows;
}

async function reconcileCustomerHistory(client: DbClient): Promise<void> {
  const rows = await client.order.findMany({
    where: { id: { startsWith: DEMO_PREFIX } },
    select: { customerId: true, status: true, totalPrice: true },
  });
  const totals = new Map<string, { orders: number; spent: number }>();

  for (const row of rows) {
    const value = totals.get(row.customerId) ?? { orders: 0, spent: 0 };
    value.orders += 1;
    if (row.status === "delivered") value.spent += row.totalPrice;
    totals.set(row.customerId, value);
  }

  for (const [customerId, value] of totals) {
    await client.customer.updateMany({
      where: { id: customerId },
      data: { orderCount: value.orders, totalSpent: value.spent },
    });
  }
}

/**
 * Add the older eleven months to the rich recent demo story.
 *
 * IDs and dates are deterministic relative to one frozen reference clock. The
 * function is idempotent, so lifecycle repair/retry can safely call it again.
 */
export async function ensureAlgerianDemoAnnualHistory(
  client: DbClient = db,
  reference: Date = algerianDemoReferenceNow(),
): Promise<void> {
  const existingAnnual = await client.order.count({
    where: { id: { startsWith: "demo-order-year-" } },
  });
  if (existingAnnual > 0) {
    await reconcileCustomerHistory(client);
    return;
  }

  const [products, customers] = await Promise.all([
    client.product.findMany({
      where: { id: { startsWith: "demo-product-" } },
      orderBy: { id: "asc" },
      select: { id: true, name: true, price: true },
    }),
    client.customer.findMany({
      where: { id: { startsWith: "demo-customer-" } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        wilaya: true,
        commune: true,
        address: true,
      },
    }),
  ]);
  if (products.length === 0 || customers.length === 0) return;

  const ages = historicalOrderAges(reference);
  let deliveryIndex = 0;
  let returnIndex = 0;
  let refundIndex = 0;

  for (let historyIndex = 0; historyIndex < ages.length; historyIndex += 1) {
    const age = ages[historyIndex]!;
    const absoluteIndex = BASE_ORDER_COUNT + historyIndex + 1;
    const customer = customers[(historyIndex * 5 + 3) % customers.length]!;
    const productA = products[(historyIndex * 3 + 1) % products.length]!;
    const productB = products[(historyIndex * 7 + 4) % products.length]!;
    const status = HISTORICAL_STATUSES[historyIndex % HISTORICAL_STATUSES.length]!;
    const source = SOURCES[historyIndex % SOURCES.length]!;
    const quantityA = historyIndex % 9 === 0 ? 2 : 1;
    const includeSecond = historyIndex % 4 === 0 && productB.id !== productA.id;
    const deliveryCost = [450, 500, 550, 600, 700, 800][historyIndex % 6]!;
    const totalPrice =
      productA.price * quantityA +
      (includeSecond ? productB.price : 0) +
      deliveryCost;
    const createdAt = demoDaysBefore(
      reference,
      age,
      9 + (historyIndex % 10),
      (historyIndex * 11) % 60,
    );
    const confirmedAt =
      status === "cancelled"
        ? null
        : demoHoursAfter(createdAt, 1 + (historyIndex % 5));
    const shippedAt = confirmedAt
      ? demoHoursAfter(createdAt, 7 + (historyIndex % 9))
      : null;
    const deliveredAt =
      status === "delivered" || status === "returned"
        ? demoDaysAfter(createdAt, 1 + (historyIndex % 3))
        : null;
    const codCollected = status === "delivered" || status === "returned";
    const codRemitted = status === "delivered";
    const orderId = `demo-order-year-${String(absoluteIndex).padStart(3, "0")}`;
    const orderNumber = `DZ-DEMO-${String(absoluteIndex).padStart(4, "0")}`;

    await client.order.create({
      data: {
        id: orderId,
        orderNumber,
        status,
        customerId: customer.id,
        totalPrice,
        deliveryCost,
        wilaya: customer.wilaya ?? "Alger",
        commune: customer.commune ?? "Alger Centre",
        address: customer.address ?? "Adresse démonstrative",
        phone: customer.phone ?? "0550000000",
        source,
        sourceOrderId:
          source === "manual" || source === "whatsapp"
            ? null
            : `EXT-YEAR-${String(absoluteIndex).padStart(4, "0")}`,
        sourceMetadata: JSON.stringify({
          demo: true,
          annualHistory: true,
          campaign: campaignFor(createdAt),
        }),
        notes:
          historyIndex % 17 === 0
            ? "Client récurrent — appeler avant expédition."
            : null,
        confirmedAt,
        shippedAt,
        deliveredAt,
        codCollected: codCollected ? true : null,
        codCollectedAt: codCollected && deliveredAt ? deliveredAt : null,
        codRemitted,
        codRemittedAt:
          codRemitted && deliveredAt ? demoDaysAfter(deliveredAt, 2) : null,
        codRemittanceRef: codRemitted
          ? `REM-YEAR-${createdAt.getFullYear()}-${String(absoluteIndex).padStart(4, "0")}`
          : null,
        createdAt,
        items: {
          create: [
            {
              id: `${orderId}-item-1`,
              productId: productA.id,
              productName: productA.name,
              quantity: quantityA,
              unitPrice: productA.price,
              total: productA.price * quantityA,
            },
            ...(includeSecond
              ? [
                  {
                    id: `${orderId}-item-2`,
                    productId: productB.id,
                    productName: productB.name,
                    quantity: 1,
                    unitPrice: productB.price,
                    total: productB.price,
                  },
                ]
              : []),
          ],
        },
      },
    });

    const changes: Array<{
      actionType: string;
      at: Date;
      payload: Record<string, unknown>;
    }> = [
      {
        actionType: "create",
        at: createdAt,
        payload: { source, status: "pending", annualHistory: true },
      },
    ];
    if (confirmedAt) {
      changes.push({
        actionType: "status_change",
        at: confirmedAt,
        payload: { from: "pending", to: "confirmed" },
      });
    }
    if (shippedAt) {
      changes.push({
        actionType: "ship",
        at: shippedAt,
        payload: { provider: PROVIDERS[historyIndex % PROVIDERS.length] },
      });
    }
    if (deliveredAt) {
      changes.push({
        actionType: status === "returned" ? "return" : "deliver",
        at: deliveredAt,
        payload: { codCollected, amount: totalPrice },
      });
    } else if (status === "refused" && shippedAt) {
      changes.push({
        actionType: "refuse",
        at: demoDaysAfter(shippedAt, 2),
        payload: { reason: "Client indisponible ou refus à la livraison" },
      });
    } else if (status === "cancelled") {
      changes.push({
        actionType: "cancel",
        at: demoHoursAfter(createdAt, 3),
        payload: { reason: "Annulation avant préparation" },
      });
    }
    if (codRemitted && deliveredAt) {
      changes.push({
        actionType: "cod_remitted",
        at: demoDaysAfter(deliveredAt, 2),
        payload: { amount: totalPrice },
      });
    }

    for (let changeIndex = 0; changeIndex < changes.length; changeIndex += 1) {
      const change = changes[changeIndex]!;
      await client.orderChange.create({
        data: {
          id: `${orderId}-change-${changeIndex + 1}`,
          orderId,
          status: "confirmed",
          actionType: change.actionType,
          actor: changeIndex === 0 ? "system" : "owner",
          payload: JSON.stringify(change.payload),
          confirmedBy: changeIndex === 0 ? "system" : "owner",
          confirmedAt: change.at,
          createdAt: change.at,
        },
      });
    }

    if (status !== "cancelled") {
      deliveryIndex += 1;
      const provider = PROVIDERS[historyIndex % PROVIDERS.length]!;
      const deliveryStatus =
        status === "delivered"
          ? "delivered"
          : status === "returned"
            ? "returned"
            : status === "refused"
              ? "refused"
              : "delivered";
      const year = String(createdAt.getFullYear()).slice(-2);
      await client.delivery.create({
        data: {
          id: `demo-delivery-year-${String(deliveryIndex).padStart(3, "0")}`,
          orderId,
          provider,
          trackingNumber: `${provider.toUpperCase()}-${year}-${String(absoluteIndex).padStart(5, "0")}`,
          cost: deliveryCost,
          status: deliveryStatus,
          estimatedDelivery: demoDaysAfter(createdAt, 2),
          createdAt: shippedAt ?? demoHoursAfter(createdAt, 8),
        },
      });
    }

    if (status === "returned") {
      returnIndex += 1;
      const returnId = `demo-return-year-${String(returnIndex).padStart(3, "0")}`;
      await client.return.create({
        data: {
          id: returnId,
          orderId,
          type: returnIndex % 3 === 0 ? "exchange" : "return",
          status: returnIndex % 4 === 0 ? "approved" : "completed",
          reason:
            returnIndex % 2 === 0
              ? "Taille ou variante non adaptée"
              : "Produit retourné après contrôle client",
          notes: "Historique annuel démonstratif — contrôle et décision documentés.",
          createdAt: demoDaysAfter(createdAt, 4),
        },
      });
      await client.returnNote.create({
        data: {
          id: `${returnId}-note-1`,
          returnId,
          body:
            returnIndex % 3 === 0
              ? "Échange validé après confirmation du client."
              : "Colis contrôlé; état compatible avec le traitement du retour.",
          createdAt: demoDaysAfter(createdAt, 5),
        },
      });

      if (returnIndex % 3 !== 0) {
        refundIndex += 1;
        await client.refund.create({
          data: {
            id: `demo-refund-year-${String(refundIndex).padStart(3, "0")}`,
            orderId,
            amount: productA.price,
            method: refundIndex % 2 === 0 ? "cash" : "courier_deduction",
            reason: "Remboursement historique lié à un retour",
            returnId,
            createdBy: "owner",
            status: "completed",
            idempotencyKey: `demo-refund-year-key-${refundIndex}`,
            processedAt: demoDaysAfter(createdAt, 6),
            reference: `DEMO-YEAR-RF-${String(refundIndex).padStart(3, "0")}`,
            createdAt: demoDaysAfter(createdAt, 6),
          },
        });
      }
    }
  }

  const expenses = expensePlan(reference);
  await client.expense.createMany({
    data: expenses.map((entry) => {
      const date = demoDaysBefore(reference, entry.age, 10, 0);
      return {
        id: entry.id,
        category: entry.category,
        amount: entry.amount,
        date,
        notes: entry.notes,
        createdAt: date,
      };
    }),
  });

  await reconcileCustomerHistory(client);
}

export async function isAlgerianDemoAnnualHistoryComplete(
  client: DbClient = db,
  reference: Date = algerianDemoReferenceNow(),
): Promise<boolean> {
  const [count, oldest] = await Promise.all([
    client.order.count({ where: { id: { startsWith: DEMO_PREFIX } } }),
    client.order.findFirst({
      where: { id: { startsWith: DEMO_PREFIX } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  if (!oldest || count < 160) return false;

  const oldestAllowed = demoDaysBefore(
    reference,
    ALGERIAN_DEMO_HISTORY_DAYS - 14,
    23,
    59,
  );
  return oldest.createdAt.getTime() <= oldestAllowed.getTime();
}
