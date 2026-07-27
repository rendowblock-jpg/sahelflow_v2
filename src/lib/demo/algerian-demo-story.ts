import "server-only";

import { db, type DbClient } from "@/lib/db";

const FLAGSHIP_ORDER_ID = "demo-order-001";
const FLAGSHIP_CUSTOMER_ID = "demo-customer-01";
const FLAGSHIP_PRODUCT_ID = "demo-product-01";
const FLAGSHIP_TOTAL = 6_350;

const hoursAfter = (value: Date, hours: number) =>
  new Date(value.getTime() + hours * 60 * 60 * 1000);
const daysAfter = (value: Date, days: number) =>
  new Date(value.getTime() + days * 24 * 60 * 60 * 1000);

/**
 * Make the Founder walkthrough internally consistent across inbox, order,
 * delivery, COD and audit surfaces.
 *
 * The broad generator intentionally varies quantities, products and states.
 * This idempotent finalizer reserves the first identity for one exact flagship
 * story: Fatima Zohra orders one mini printer for 5,900 DZD plus 450 DZD
 * delivery, the parcel is delivered by Yalidine and its COD is remitted.
 */
export async function finalizeAlgerianDemoStory(
  client: DbClient = db,
): Promise<void> {
  const order = await client.order.findUnique({
    where: { id: FLAGSHIP_ORDER_ID },
    select: { id: true, createdAt: true },
  });
  if (!order) return;

  const confirmedAt = hoursAfter(order.createdAt, 2);
  const shippedAt = hoursAfter(order.createdAt, 8);
  const deliveredAt = daysAfter(order.createdAt, 2);
  const remittedAt = daysAfter(deliveredAt, 2);

  await client.orderItem.deleteMany({ where: { orderId: FLAGSHIP_ORDER_ID } });
  await client.orderItem.create({
    data: {
      id: "demo-order-001-item-1",
      orderId: FLAGSHIP_ORDER_ID,
      productId: FLAGSHIP_PRODUCT_ID,
      productName: "Mini imprimante thermique Bluetooth",
      quantity: 1,
      unitPrice: 5_900,
      total: 5_900,
    },
  });

  await client.order.update({
    where: { id: FLAGSHIP_ORDER_ID },
    data: {
      status: "delivered",
      totalPrice: FLAGSHIP_TOTAL,
      deliveryCost: 450,
      confirmedAt,
      shippedAt,
      deliveredAt,
      codCollected: true,
      codCollectedAt: deliveredAt,
      codRemitted: true,
      codRemittedAt: remittedAt,
      codRemittanceRef: "REM-YAL-DEMO-001",
      notes:
        "Commande extraite de la conversation WhatsApp arabe de Fatima Zohra; appel demandé avant expédition.",
    },
  });

  await client.delivery.upsert({
    where: { orderId: FLAGSHIP_ORDER_ID },
    update: {
      provider: "yalidine",
      trackingNumber: "YALIDINE-DEMO-26001",
      cost: 450,
      status: "delivered",
      estimatedDelivery: deliveredAt,
    },
    create: {
      id: "demo-delivery-flagship",
      orderId: FLAGSHIP_ORDER_ID,
      provider: "yalidine",
      trackingNumber: "YALIDINE-DEMO-26001",
      cost: 450,
      status: "delivered",
      estimatedDelivery: deliveredAt,
      createdAt: shippedAt,
    },
  });

  const changes = [
    {
      id: "demo-order-001-change-confirmed",
      actionType: "status_change",
      createdAt: confirmedAt,
      payload: { from: "pending", to: "confirmed", channel: "whatsapp_ar" },
    },
    {
      id: "demo-order-001-change-shipped",
      actionType: "ship",
      createdAt: shippedAt,
      payload: { provider: "yalidine", trackingNumber: "YALIDINE-DEMO-26001" },
    },
    {
      id: "demo-order-001-change-delivered",
      actionType: "deliver",
      createdAt: deliveredAt,
      payload: { codCollected: true, amount: FLAGSHIP_TOTAL },
    },
    {
      id: "demo-order-001-change-remitted",
      actionType: "cod_remitted",
      createdAt: remittedAt,
      payload: {
        remittanceRef: "REM-YAL-DEMO-001",
        amount: FLAGSHIP_TOTAL,
      },
    },
  ] as const;

  for (const change of changes) {
    await client.orderChange.upsert({
      where: { id: change.id },
      update: {
        status: "confirmed",
        actionType: change.actionType,
        actor: "owner",
        payload: JSON.stringify(change.payload),
        confirmedBy: "owner",
        confirmedAt: change.createdAt,
        createdAt: change.createdAt,
      },
      create: {
        id: change.id,
        orderId: FLAGSHIP_ORDER_ID,
        status: "confirmed",
        actionType: change.actionType,
        actor: "owner",
        payload: JSON.stringify(change.payload),
        confirmedBy: "owner",
        confirmedAt: change.createdAt,
        createdAt: change.createdAt,
      },
    });
  }

  const [orderCount, delivered] = await Promise.all([
    client.order.count({ where: { customerId: FLAGSHIP_CUSTOMER_ID } }),
    client.order.aggregate({
      where: { customerId: FLAGSHIP_CUSTOMER_ID, status: "delivered" },
      _sum: { totalPrice: true },
    }),
  ]);
  await client.customer.update({
    where: { id: FLAGSHIP_CUSTOMER_ID },
    data: {
      orderCount,
      totalSpent: delivered._sum.totalPrice ?? 0,
    },
  });

  await client.aiChatMessage.updateMany({
    where: { id: "demo-ai-message-4" },
    data: {
      content:
        "Le parcours DZ-DEMO-0001 est complet : confirmation WhatsApp en arabe, expédition Yalidine, livraison, collecte COD et remise REM-YAL-DEMO-001. Utilisez-le pour parcourir l'historique de bout en bout.",
    },
  });
}
