import "server-only";

import { db, type DbClient } from "@/lib/db";

const FLAGSHIP_ORDER_ID = "demo-order-001";
const FLAGSHIP_CUSTOMER_ID = "demo-customer-01";
const FLAGSHIP_PRODUCT_ID = "demo-product-01";
const FLAGSHIP_CONVERSATION_ID = "demo-conversation-01";
const FLAGSHIP_TOTAL = 6_350;

const minutesAfter = (value: Date, minutes: number) =>
  new Date(value.getTime() + minutes * 60 * 1000);
const hoursAfter = (value: Date, hours: number) =>
  new Date(value.getTime() + hours * 60 * 60 * 1000);
const daysAfter = (value: Date, days: number) =>
  new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
const daysBefore = (value: Date, days: number) =>
  new Date(value.getTime() - days * 24 * 60 * 60 * 1000);

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
    select: { id: true },
  });
  if (!order) return;

  // Anchor the completed walkthrough six days before seeding. The broad seed's
  // first order is generated for today, which would otherwise put delivery and
  // remittance several days in the future while already marking them complete.
  const conversationStartedAt = daysBefore(new Date(), 6);
  conversationStartedAt.setHours(8, 30, 0, 0);
  const messageTimes = [0, 15, 30, 45].map((minutes) =>
    minutesAfter(conversationStartedAt, minutes),
  );
  const orderCreatedAt = minutesAfter(conversationStartedAt, 60);
  const confirmedAt = hoursAfter(orderCreatedAt, 2);
  const shippedAt = hoursAfter(orderCreatedAt, 8);
  const deliveredAt = daysAfter(orderCreatedAt, 2);
  const remittedAt = daysAfter(deliveredAt, 2);

  await client.conversation.updateMany({
    where: { id: FLAGSHIP_CONVERSATION_ID },
    data: {
      createdAt: conversationStartedAt,
      lastMessageAt: messageTimes[3],
    },
  });
  for (let index = 0; index < messageTimes.length; index += 1) {
    await client.message.updateMany({
      where: {
        id: `${FLAGSHIP_CONVERSATION_ID}-message-${index + 1}`,
      },
      data: {
        timestamp: messageTimes[index],
        createdAt: messageTimes[index],
      },
    });
  }

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
      createdAt: orderCreatedAt,
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
      createdAt: shippedAt,
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

  // Replace the broad generator's pending create-only entry with one clean,
  // chronological flagship timeline.
  await client.orderChange.deleteMany({ where: { orderId: FLAGSHIP_ORDER_ID } });
  const changes = [
    {
      id: "demo-order-001-change-created",
      actionType: "create",
      actor: "system",
      createdAt: orderCreatedAt,
      payload: { source: "whatsapp", status: "pending" },
    },
    {
      id: "demo-order-001-change-confirmed",
      actionType: "status_change",
      actor: "owner",
      createdAt: confirmedAt,
      payload: { from: "pending", to: "confirmed", channel: "whatsapp_ar" },
    },
    {
      id: "demo-order-001-change-shipped",
      actionType: "ship",
      actor: "owner",
      createdAt: shippedAt,
      payload: { provider: "yalidine", trackingNumber: "YALIDINE-DEMO-26001" },
    },
    {
      id: "demo-order-001-change-delivered",
      actionType: "deliver",
      actor: "owner",
      createdAt: deliveredAt,
      payload: { codCollected: true, amount: FLAGSHIP_TOTAL },
    },
    {
      id: "demo-order-001-change-remitted",
      actionType: "cod_remitted",
      actor: "owner",
      createdAt: remittedAt,
      payload: {
        remittanceRef: "REM-YAL-DEMO-001",
        amount: FLAGSHIP_TOTAL,
      },
    },
  ] as const;

  for (const change of changes) {
    await client.orderChange.create({
      data: {
        id: change.id,
        orderId: FLAGSHIP_ORDER_ID,
        status: "confirmed",
        actionType: change.actionType,
        actor: change.actor,
        payload: JSON.stringify(change.payload),
        confirmedBy: change.actor === "owner" ? "owner" : "system",
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
