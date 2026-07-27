import "server-only";

import { db, type DbClient } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";

export const ALGERIAN_DEMO_VERSION = "algerian-cod-founder-v1";
const DEMO_PREFIX = "demo-";
const DEMO_MARKER_KEY = "demo_seed_version";
const DEMO_CREATED_AT_KEY = "demo_seed_created_at";

type DemoCounts = {
  categories: number;
  products: number;
  customers: number;
  orders: number;
  deliveries: number;
  returns: number;
  refunds: number;
  conversations: number;
  messages: number;
  expenses: number;
};

export type AlgerianDemoStatus = {
  version: string;
  loaded: boolean;
  canSeed: boolean;
  hasBusinessData: boolean;
  createdAt: string | null;
  counts: DemoCounts;
};

const now = () => new Date();
const daysAgo = (days: number, hour = 12, minute = 0) => {
  const value = now();
  value.setDate(value.getDate() - days);
  value.setHours(hour, minute, 0, 0);
  return value;
};
const hoursAfter = (value: Date, hours: number) =>
  new Date(value.getTime() + hours * 60 * 60 * 1000);
const daysAfter = (value: Date, days: number) =>
  new Date(value.getTime() + days * 24 * 60 * 60 * 1000);

const CATEGORIES = [
  { id: "demo-cat-electronics", name: "Électronique & accessoires" },
  { id: "demo-cat-home", name: "Maison & cuisine" },
  { id: "demo-cat-fashion", name: "Mode & beauté" },
  { id: "demo-cat-family", name: "Bébé & famille" },
  { id: "demo-cat-gifts", name: "Bien-être & cadeaux" },
] as const;

const PRODUCTS = [
  { id: "demo-product-01", categoryId: "demo-cat-electronics", name: "Mini imprimante thermique Bluetooth", sku: "DZ-ELEC-001", price: 5900, cost: 3350, stock: 31, lowStockThreshold: 8 },
  { id: "demo-product-02", categoryId: "demo-cat-electronics", name: "Ring light 26 cm avec trépied", sku: "DZ-ELEC-002", price: 4200, cost: 2250, stock: 18, lowStockThreshold: 6 },
  { id: "demo-product-03", categoryId: "demo-cat-electronics", name: "Écouteurs sans fil Pro", sku: "DZ-ELEC-003", price: 3900, cost: 2100, stock: 44, lowStockThreshold: 10 },
  { id: "demo-product-04", categoryId: "demo-cat-electronics", name: "Power bank compact 20 000 mAh", sku: "DZ-ELEC-004", price: 4600, cost: 2700, stock: 7, lowStockThreshold: 10 },
  { id: "demo-product-05", categoryId: "demo-cat-home", name: "Hachoir électrique multifonction", sku: "DZ-HOME-001", price: 6400, cost: 3650, stock: 24, lowStockThreshold: 7 },
  { id: "demo-product-06", categoryId: "demo-cat-home", name: "Boîte de rangement pliable 66 L", sku: "DZ-HOME-002", price: 3700, cost: 1850, stock: 36, lowStockThreshold: 8 },
  { id: "demo-product-07", categoryId: "demo-cat-home", name: "Organisateur cuisine rotatif", sku: "DZ-HOME-003", price: 2900, cost: 1350, stock: 28, lowStockThreshold: 8 },
  { id: "demo-product-08", categoryId: "demo-cat-home", name: "Lampe LED rechargeable tactile", sku: "DZ-HOME-004", price: 3300, cost: 1700, stock: 5, lowStockThreshold: 8 },
  { id: "demo-product-09", categoryId: "demo-cat-fashion", name: "Abaya Medina premium", sku: "DZ-MODE-001", price: 7200, cost: 3900, stock: 22, lowStockThreshold: 6 },
  { id: "demo-product-10", categoryId: "demo-cat-fashion", name: "Sac bandoulière femme minimal", sku: "DZ-MODE-002", price: 5100, cost: 2600, stock: 27, lowStockThreshold: 7 },
  { id: "demo-product-11", categoryId: "demo-cat-fashion", name: "Coffret parfum oriental 3 pièces", sku: "DZ-BEAU-001", price: 6800, cost: 3400, stock: 19, lowStockThreshold: 6 },
  { id: "demo-product-12", categoryId: "demo-cat-fashion", name: "Brosse lissante céramique", sku: "DZ-BEAU-002", price: 5600, cost: 3100, stock: 16, lowStockThreshold: 6 },
  { id: "demo-product-13", categoryId: "demo-cat-family", name: "Veilleuse silicone rechargeable", sku: "DZ-FAM-001", price: 3500, cost: 1750, stock: 33, lowStockThreshold: 8 },
  { id: "demo-product-14", categoryId: "demo-cat-family", name: "Sac à langer grande capacité", sku: "DZ-FAM-002", price: 6200, cost: 3300, stock: 14, lowStockThreshold: 6 },
  { id: "demo-product-15", categoryId: "demo-cat-gifts", name: "Coffret cadeau Oud & Ambre", sku: "DZ-GIFT-001", price: 7500, cost: 3750, stock: 21, lowStockThreshold: 6 },
  { id: "demo-product-16", categoryId: "demo-cat-gifts", name: "Tapis de prière velours premium", sku: "DZ-GIFT-002", price: 4300, cost: 2100, stock: 40, lowStockThreshold: 9 },
] as const;

const VARIANTS = [
  { id: "demo-variant-01", productId: "demo-product-03", name: "Noir", sku: "DZ-ELEC-003-NR", price: 3900, stock: 24, sortOrder: 0 },
  { id: "demo-variant-02", productId: "demo-product-03", name: "Blanc", sku: "DZ-ELEC-003-BL", price: 4100, stock: 20, sortOrder: 1 },
  { id: "demo-variant-03", productId: "demo-product-09", name: "Taille M", sku: "DZ-MODE-001-M", price: 7200, stock: 8, sortOrder: 0 },
  { id: "demo-variant-04", productId: "demo-product-09", name: "Taille L", sku: "DZ-MODE-001-L", price: 7200, stock: 8, sortOrder: 1 },
  { id: "demo-variant-05", productId: "demo-product-09", name: "Taille XL", sku: "DZ-MODE-001-XL", price: 7400, stock: 6, sortOrder: 2 },
  { id: "demo-variant-06", productId: "demo-product-10", name: "Noir", sku: "DZ-MODE-002-NR", price: 5100, stock: 15, sortOrder: 0 },
  { id: "demo-variant-07", productId: "demo-product-10", name: "Camel", sku: "DZ-MODE-002-CM", price: 5300, stock: 12, sortOrder: 1 },
] as const;

const CUSTOMERS = [
  ["Fatima Zohra Benamar", "0550001101", "Alger", "Bab Ezzouar", "Cité AADL, Bâtiment 14"],
  ["Yacine Boudiaf", "0660001102", "Oran", "Bir El Djir", "Hai Sabah, îlot 18"],
  ["Amel Khelifi", "0770001103", "Sétif", "El Eulma", "Cité 1000 logements"],
  ["Mohamed Amine Saïdi", "0550001104", "Constantine", "El Khroub", "Nouvelle ville Ali Mendjeli"],
  ["Nesrine Belkacem", "0660001105", "Blida", "Boufarik", "Route de Soumaa"],
  ["Walid Cherif", "0770001106", "Batna", "Batna", "Cité 1200 logements"],
  ["Imene Aït Ahmed", "0550001107", "Tizi Ouzou", "Azazga", "Lotissement Tala"],
  ["Riad Mansouri", "0660001108", "Béjaïa", "Akbou", "Quartier Guendouza"],
  ["Sara Bouzid", "0770001109", "Annaba", "El Bouni", "Cité 8 Mars"],
  ["Sofiane Merabet", "0550001110", "Tlemcen", "Mansourah", "Boulevard Imama"],
  ["Khadidja Rahmani", "0660001111", "Médéa", "Berrouaghia", "Cité El Wiam"],
  ["Adel Benyahia", "0770001112", "Djelfa", "Aïn Oussera", "Quartier 5 Juillet"],
  ["Lamia Hamdi", "0550001113", "Skikda", "Azzaba", "Cité des Frères"],
  ["Nabil Ouali", "0660001114", "Mostaganem", "Mostaganem", "Salamandre"],
  ["Dounia Haddad", "0770001115", "Chlef", "Chlef", "Hay Nasr"],
  ["Karim Meziane", "0550001116", "Boumerdès", "Boudouaou", "Cité 800 logements"],
  ["Meriem Touati", "0660001117", "Alger", "Birkhadem", "Coopérative El Feth"],
  ["Fares Bensaïd", "0770001118", "Oran", "Es Sénia", "Cité 2000 logements"],
  ["Wissam Brahimi", "0550001119", "Sétif", "Sétif", "El Hidhab"],
  ["Omar Maouche", "0660001120", "Béjaïa", "Béjaïa", "Ihaddaden"],
  ["Nadia Slimani", "0770001121", "Constantine", "Constantine", "Sidi Mabrouk"],
  ["Bilal Ziani", "0550001122", "Tiaret", "Tiaret", "Cité Sonatiba"],
  ["Houda Gacem", "0660001123", "Tipaza", "Koléa", "Cité 500 logements"],
  ["Reda Mokrani", "0770001124", "M'Sila", "M'Sila", "Cité 206 logements"],
] as const;

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "delivered",
  "delivered",
  "returned",
  "refused",
  "cancelled",
  "draft",
  "pending",
  "delivered",
] as const;

const SOURCES = [
  "whatsapp",
  "whatsapp",
  "manual",
  "storefront",
  "youcan",
  "woocommerce",
] as const;

const PROVIDERS = ["yalidine", "zrexpress", "maystro"] as const;

async function businessCounts(client: DbClient): Promise<DemoCounts> {
  const [
    categories,
    products,
    customers,
    orders,
    deliveries,
    returns,
    refunds,
    conversations,
    messages,
    expenses,
  ] = await Promise.all([
    client.category.count(),
    client.product.count(),
    client.customer.count(),
    client.order.count(),
    client.delivery.count(),
    client.return.count(),
    client.refund.count(),
    client.conversation.count(),
    client.message.count(),
    client.expense.count(),
  ]);

  return {
    categories,
    products,
    customers,
    orders,
    deliveries,
    returns,
    refunds,
    conversations,
    messages,
    expenses,
  };
}

function hasAnyBusinessData(counts: DemoCounts): boolean {
  return Object.values(counts).some((count) => count > 0);
}

export async function getAlgerianDemoStatus(
  client: DbClient = db,
): Promise<AlgerianDemoStatus> {
  const [marker, createdAt, counts] = await Promise.all([
    client.setting.findUnique({ where: { key: DEMO_MARKER_KEY } }),
    client.setting.findUnique({ where: { key: DEMO_CREATED_AT_KEY } }),
    businessCounts(client),
  ]);
  const loaded = marker?.value === ALGERIAN_DEMO_VERSION;
  const hasBusinessData = hasAnyBusinessData(counts);

  return {
    version: ALGERIAN_DEMO_VERSION,
    loaded,
    canSeed: !loaded && !hasBusinessData,
    hasBusinessData,
    createdAt: createdAt?.value ?? null,
    counts,
  };
}

async function clearDemoRecords(client: DbClient): Promise<void> {
  await client.extractionMetric.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.auditLog.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.aiChatMessage.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.aiChatSession.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.automationLog.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.automation.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.returnNote.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.refund.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.return.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.delivery.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.orderChange.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.orderItem.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.order.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.message.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.conversation.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.customer.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.productVariant.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.product.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.category.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.expense.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.storefrontConfig.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.cannedResponse.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.whatsAppTemplate.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  await client.setting.deleteMany({
    where: { key: { in: [DEMO_MARKER_KEY, DEMO_CREATED_AT_KEY] } },
  });
}

export async function clearAlgerianDemoData(
  client: DbClient = db,
): Promise<AlgerianDemoStatus> {
  await clearDemoRecords(client);
  return getAlgerianDemoStatus(client);
}

export async function seedAlgerianDemoData(
  client: DbClient = db,
): Promise<AlgerianDemoStatus> {
  const initial = await getAlgerianDemoStatus(client);
  if (initial.loaded) return initial;
  if (initial.hasBusinessData) {
    throw new SahelFlowError(
      "Sample data can only be loaded into an empty shop so it never mixes with seller records.",
      "DEMO_SHOP_NOT_EMPTY",
      409,
    );
  }

  try {
    await client.category.createMany({ data: CATEGORIES.map((category) => ({ ...category })) });
    await client.product.createMany({
      data: PRODUCTS.map((product) => ({
        ...product,
        isActive: true,
      })),
    });
    await client.productVariant.createMany({
      data: VARIANTS.map((variant) => ({
        ...variant,
        isActive: true,
      })),
    });

    await client.customer.createMany({
      data: CUSTOMERS.map(([name, phone, wilaya, commune, address], index) => ({
        id: `demo-customer-${String(index + 1).padStart(2, "0")}`,
        name,
        phone,
        wilaya,
        commune,
        address,
        orderCount: 0,
        totalSpent: 0,
        riskScore: index === 11 ? 78 : index % 7 === 0 ? 42 : 14 + (index % 4) * 6,
        isBlacklisted: index === 11,
        blacklistReason:
          index === 11 ? "Deux colis refusés et numéro injoignable" : null,
        blacklistedAt: index === 11 ? daysAgo(8) : null,
        notes:
          index === 0
            ? "Cliente fidèle — préfère WhatsApp et livraison en fin de journée"
            : index % 6 === 0
              ? "Appeler avant expédition"
              : null,
        createdAt: daysAgo(60 - index),
      })),
    });

    const customerTotals = new Map<string, { orders: number; spent: number }>();
    const createdOrders: Array<{
      id: string;
      status: string;
      customerId: string;
      createdAt: Date;
      totalPrice: number;
    }> = [];

    for (let index = 0; index < 48; index += 1) {
      const customerIndex = index % CUSTOMERS.length;
      const customerId = `demo-customer-${String(customerIndex + 1).padStart(2, "0")}`;
      const productA = PRODUCTS[(index * 3) % PRODUCTS.length]!;
      const productB = PRODUCTS[(index * 5 + 2) % PRODUCTS.length]!;
      const status = ORDER_STATUSES[index % ORDER_STATUSES.length]!;
      const source = SOURCES[index % SOURCES.length]!;
      const quantityA = index % 5 === 0 ? 2 : 1;
      const includeSecond = index % 3 === 0 && productB.id !== productA.id;
      const deliveryCost = [450, 500, 600, 700, 800][index % 5]!;
      const itemsTotal =
        productA.price * quantityA + (includeSecond ? productB.price : 0);
      const totalPrice = itemsTotal + deliveryCost;
      const createdAt = daysAgo(Math.floor(index * 34 / 47), 9 + (index % 10), (index * 7) % 60);
      const confirmedAt = ["confirmed", "shipped", "delivered", "returned", "refused"].includes(status)
        ? hoursAfter(createdAt, 2 + (index % 4))
        : null;
      const shippedAt = ["shipped", "delivered", "returned", "refused"].includes(status)
        ? hoursAfter(createdAt, 8 + (index % 8))
        : null;
      const deliveredAt = ["delivered", "returned"].includes(status)
        ? daysAfter(createdAt, 1 + (index % 3))
        : null;
      const customer = CUSTOMERS[customerIndex]!;
      const orderId = `demo-order-${String(index + 1).padStart(3, "0")}`;
      const orderNumber = `DZ-DEMO-${String(index + 1).padStart(4, "0")}`;
      const collected = status === "delivered" || status === "returned";
      const remitted = status === "delivered" && index % 4 !== 0;

      await client.order.create({
        data: {
          id: orderId,
          orderNumber,
          status,
          customerId,
          totalPrice,
          deliveryCost,
          wilaya: customer[2],
          commune: customer[3],
          address: customer[4],
          phone: customer[1],
          source,
          sourceOrderId:
            source === "manual" || source === "whatsapp"
              ? null
              : `EXT-DEMO-${String(index + 1).padStart(4, "0")}`,
          sourceMetadata: JSON.stringify({
            demo: true,
            campaign:
              index % 3 === 0
                ? "Ramadan Maison"
                : index % 3 === 1
                  ? "Best Sellers COD"
                  : "Retargeting WhatsApp",
          }),
          notes:
            index === 0
              ? "Commande extraite depuis la conversation WhatsApp arabe de Fatima Zohra."
              : index % 9 === 0
                ? "Client demande un appel avant expédition."
                : null,
          confirmedAt,
          shippedAt,
          deliveredAt,
          codCollected: collected ? true : null,
          codCollectedAt: collected && deliveredAt ? deliveredAt : null,
          codRemitted: remitted,
          codRemittedAt: remitted && deliveredAt ? daysAfter(deliveredAt, 2) : null,
          codRemittanceRef: remitted
            ? `REM-YAL-${String(Math.floor(index / 4) + 1).padStart(3, "0")}`
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
                ? [{
                    id: `${orderId}-item-2`,
                    productId: productB.id,
                    productName: productB.name,
                    quantity: 1,
                    unitPrice: productB.price,
                    total: productB.price,
                  }]
                : []),
            ],
          },
        },
      });

      const totals = customerTotals.get(customerId) ?? { orders: 0, spent: 0 };
      totals.orders += 1;
      if (status === "delivered") totals.spent += totalPrice;
      customerTotals.set(customerId, totals);
      createdOrders.push({ id: orderId, status, customerId, createdAt, totalPrice });

      const changes: Array<{
        actionType: string;
        at: Date;
        payload: Record<string, unknown>;
      }> = [
        {
          actionType: "create",
          at: createdAt,
          payload: { source, status: "draft" },
        },
      ];
      if (confirmedAt) {
        changes.push({
          actionType: "status_change",
          at: confirmedAt,
          payload: { from: "pending", to: "confirmed", channel: index === 0 ? "whatsapp" : "manual_review" },
        });
      }
      if (shippedAt) {
        changes.push({
          actionType: "ship",
          at: shippedAt,
          payload: { provider: PROVIDERS[index % PROVIDERS.length] },
        });
      }
      if (deliveredAt) {
        changes.push({
          actionType: status === "returned" ? "return" : "deliver",
          at: deliveredAt,
          payload: { codCollected: true, amount: totalPrice },
        });
      }
      if (status === "cancelled") {
        changes.push({
          actionType: "cancel",
          at: hoursAfter(createdAt, 3),
          payload: { reason: "Client a annulé avant préparation" },
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
            confirmedBy: "owner",
            createdAt: change.at,
            confirmedAt: change.at,
          },
        });
      }
    }

    for (const [customerId, totals] of customerTotals) {
      await client.customer.update({
        where: { id: customerId },
        data: { orderCount: totals.orders, totalSpent: totals.spent },
      });
    }

    let deliveryIndex = 0;
    for (const order of createdOrders) {
      if (!["confirmed", "shipped", "delivered", "returned", "refused"].includes(order.status)) {
        continue;
      }
      deliveryIndex += 1;
      const provider = PROVIDERS[deliveryIndex % PROVIDERS.length]!;
      const deliveryStatus =
        order.status === "delivered"
          ? "delivered"
          : order.status === "returned"
            ? "returned"
            : order.status === "refused"
              ? "refused"
              : order.status === "shipped"
                ? ["in_transit", "at_hub", "out_for_delivery"][deliveryIndex % 3]!
                : "created";
      await client.delivery.create({
        data: {
          id: `demo-delivery-${String(deliveryIndex).padStart(3, "0")}`,
          orderId: order.id,
          provider,
          trackingNumber: `${provider.toUpperCase()}-26-${String(deliveryIndex).padStart(5, "0")}`,
          cost: [450, 500, 600, 700][deliveryIndex % 4]!,
          status: deliveryStatus,
          estimatedDelivery: daysAfter(order.createdAt, 2),
          createdAt: hoursAfter(order.createdAt, 8),
        },
      });
    }

    const returnedOrders = createdOrders.filter((order) => order.status === "returned");
    for (let index = 0; index < returnedOrders.length; index += 1) {
      const order = returnedOrders[index]!;
      const returnId = `demo-return-${String(index + 1).padStart(2, "0")}`;
      await client.return.create({
        data: {
          id: returnId,
          orderId: order.id,
          type: index % 2 === 0 ? "return" : "exchange",
          status: index % 3 === 0 ? "completed" : "approved",
          reason:
            index % 2 === 0
              ? "Produit reçu mais taille non adaptée"
              : "Échange demandé pour une autre couleur",
          notes: "Cas démonstratif avec contrôle du colis et décision documentée.",
          createdAt: daysAfter(order.createdAt, 3),
        },
      });
      await client.returnNote.create({
        data: {
          id: `${returnId}-note-1`,
          returnId,
          body:
            index % 2 === 0
              ? "Colis inspecté, produit en bon état — remise en stock autorisée."
              : "Échange validé après confirmation WhatsApp de la cliente.",
          createdAt: daysAfter(order.createdAt, 4),
        },
      });
      if (index < 2) {
        await client.refund.create({
          data: {
            id: `demo-refund-${String(index + 1).padStart(2, "0")}`,
            orderId: order.id,
            amount: index === 0 ? 3900 : 5100,
            method: index === 0 ? "courier_deduction" : "cash",
            reason: "Remboursement lié au retour démonstratif",
            returnId,
            createdBy: "owner",
            status: "completed",
            idempotencyKey: `demo-refund-key-${index + 1}`,
            processedAt: daysAfter(order.createdAt, 5),
            reference: `DEMO-RF-${String(index + 1).padStart(3, "0")}`,
            createdAt: daysAfter(order.createdAt, 5),
          },
        });
      }
    }

    const expenses = [
      ["ads", 18500, 1, "Campagne Meta — Best Sellers COD"],
      ["delivery_fees", 9200, 2, "Règlement hebdomadaire Yalidine"],
      ["packaging", 6800, 4, "Cartons, pochettes et ruban fragile"],
      ["returns", 3100, 5, "Frais retours et seconde livraison"],
      ["ads", 12000, 8, "Retargeting Instagram / Facebook"],
      ["supplies", 4500, 10, "Étiquettes thermiques et papier"],
      ["rent", 28000, 12, "Loyer espace stockage"],
      ["salary", 24000, 14, "Prime opérateur confirmation"],
      ["delivery_fees", 7600, 16, "Frais ZR Express"],
      ["other", 3800, 18, "Internet et téléphonie"],
      ["packaging", 5200, 23, "Réassort emballage premium"],
      ["ads", 14500, 28, "Campagne lancement collection maison"],
    ] as const;
    await client.expense.createMany({
      data: expenses.map(([category, amount, days, notes], index) => ({
        id: `demo-expense-${String(index + 1).padStart(2, "0")}`,
        category,
        amount,
        date: daysAgo(days),
        notes,
        createdAt: daysAgo(days),
      })),
    });

    const conversationCustomers = [0, 4, 8, 10, 13, 16, 19, 22];
    const incomingMessages = [
      "سلام، شفت mini imprimante في الصفحة. نحب وحدة لابنتي، التوصيل لباب الزوار و نقدر نخلص عند الاستلام؟",
      "Bonjour, le sac à langer est disponible en noir ? Livraison Boufarik svp.",
      "Salam, je veux le coffret Oud & Ambre pour un cadeau. Combien avec livraison Annaba ?",
      "Bonsoir, la lampe tactile est rechargeable USB ? Je confirme si oui.",
      "سلام، نحب abaya taille L couleur noire، التوصيل لبئر خادم.",
      "Le hachoir est-il garanti ? Je suis à Béjaïa centre.",
      "Je veux deux tapis de prière, un vert et un beige. Livraison Koléa.",
      "Salam, power bank 20000 disponible ? Je veux livraison M'Sila.",
    ] as const;

    for (let index = 0; index < conversationCustomers.length; index += 1) {
      const customerIndex = conversationCustomers[index]!;
      const customer = CUSTOMERS[customerIndex]!;
      const conversationId = `demo-conversation-${String(index + 1).padStart(2, "0")}`;
      const order = createdOrders.find((candidate) => candidate.customerId === `demo-customer-${String(customerIndex + 1).padStart(2, "0")}`);
      await client.conversation.create({
        data: {
          id: conversationId,
          channel: "whatsapp",
          contactName: customer[0],
          contactPhone: customer[1],
          sourceId: `${customer[1]}@s.whatsapp.net`,
          lastMessageAt: daysAgo(index % 4, 18 - (index % 3)),
          unreadCount: index % 3 === 0 ? 2 : 0,
          status: index % 4 === 0 ? "open" : index % 4 === 1 ? "pending" : "resolved",
          priority: index === 0 ? "high" : index % 3 === 0 ? "medium" : "low",
          labels: JSON.stringify(index === 0 ? ["commande", "cliente-fidèle", "arabe"] : ["commande"]),
          createdAt: daysAgo(12 - index),
        },
      });

      const messages = [
        {
          direction: "incoming",
          body: incomingMessages[index]!,
          deliveryStatus: "delivered",
          messageType: "text",
          extractionMethod: index % 2 === 0 ? "regex" : "gemini",
          extractedOrderJson: order
            ? JSON.stringify({
                orderId: order.id,
                customerName: customer[0],
                phone: customer[1],
                wilaya: customer[2],
                commune: customer[3],
                confidence: index === 0 ? 0.97 : 0.88,
              })
            : null,
        },
        {
          direction: "outgoing",
          body:
            index === 0
              ? "وعليكم السلام فاطمة الزهراء، نعم متوفرة والتوصيل لباب الزوار 450 دج. المجموع 6350 دج والدفع عند الاستلام."
              : "Bonjour, le produit est disponible. Je vous confirme le total avec livraison dans un instant.",
          deliveryStatus: "read",
          messageType: "text",
          extractionMethod: null,
          extractedOrderJson: null,
        },
        {
          direction: "incoming",
          body:
            index === 0
              ? "مليح نأكد الطلب. العنوان Cité AADL bâtiment 14، عيطولي قبل ما يخرج livreur."
              : "D'accord, je confirme. Appelez-moi avant l'expédition s'il vous plaît.",
          deliveryStatus: "delivered",
          messageType: "text",
          extractionMethod: null,
          extractedOrderJson: null,
        },
        {
          direction: "outgoing",
          body:
            index === 0
              ? "تم تأكيد الطلب DZ-DEMO-0001 ✅ التوصيل متوقع غدوة مع Yalidine، ونتصلو بك قبل الخروج."
              : `Commande ${order ? `DZ-DEMO-${order.id.slice(-3).padStart(4, "0")}` : ""} confirmée ✅`,
          deliveryStatus: "read",
          messageType: "activity",
          activityType: "order_confirmed",
          extractionMethod: null,
          extractedOrderJson: null,
        },
      ];

      for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
        const message = messages[messageIndex]!;
        const messageId = `${conversationId}-message-${messageIndex + 1}`;
        await client.message.create({
          data: {
            id: messageId,
            conversationId,
            ...message,
            timestamp: daysAgo(index % 4, 10 + messageIndex * 2),
            createdAt: daysAgo(index % 4, 10 + messageIndex * 2),
          },
        });
        if (messageIndex === 0) {
          await client.extractionMetric.create({
            data: {
              id: `demo-extraction-${String(index + 1).padStart(2, "0")}`,
              messageId,
              method: message.extractionMethod ?? "none",
              confidence: index === 0 ? 0.97 : 0.82 + (index % 3) * 0.05,
              isComplete: index !== 5,
              missingFields: index === 5 ? JSON.stringify(["commune"]) : null,
              fieldAccuracy: JSON.stringify({
                name: true,
                phone: true,
                wilaya: true,
                commune: index !== 5,
                address: index !== 5,
              }),
              latencyMs: message.extractionMethod === "gemini" ? 840 + index * 37 : 14 + index,
              modelVersion: message.extractionMethod === "gemini" ? "gemini-3.5-flash" : null,
              createdAt: daysAgo(index % 5),
            },
          });
        }
      }
    }

    const automations = [
      {
        id: "demo-automation-01",
        name: "Prioriser les commandes WhatsApp à forte valeur",
        trigger: "order_created",
        action: "assign_priority",
        conditions: JSON.stringify({ all: [{ field: "source", op: "equal", value: "whatsapp" }, { field: "totalPrice", op: "greater_than", value: 7000 }] }),
        config: JSON.stringify({ priority: "high" }),
        isActive: true,
        dryRun: true,
        runCount: 14,
        lastRunAt: daysAgo(0, 11),
      },
      {
        id: "demo-automation-02",
        name: "Alerte stock faible",
        trigger: "low_stock",
        action: "notify_seller",
        conditions: JSON.stringify({ all: [{ field: "available", op: "less_than_or_equal", value: 8 }] }),
        isActive: true,
        dryRun: true,
        runCount: 6,
        lastRunAt: daysAgo(1, 16),
      },
      {
        id: "demo-automation-03",
        name: "Relance confirmation après 2 heures",
        trigger: "order_pending",
        action: "draft_whatsapp_reply",
        config: JSON.stringify({ template: "demo_relance_confirmation", delayMinutes: 120 }),
        isActive: false,
        dryRun: true,
        runCount: 3,
        lastRunAt: daysAgo(4, 14),
      },
    ] as const;
    for (const automation of automations) {
      await client.automation.create({ data: automation });
      await client.automationLog.create({
        data: {
          id: `${automation.id}-log-1`,
          automationId: automation.id,
          trigger: automation.trigger,
          status: "dry_run",
          message: "Simulation démonstrative — aucun effet externe exécuté.",
          payload: JSON.stringify({ demo: true }),
          createdAt: automation.lastRunAt ?? daysAgo(1),
        },
      });
    }

    await client.storefrontConfig.create({
      data: {
        id: "demo-storefront-01",
        slug: "atelier-nour-demo",
        name: "Atelier Nour",
        description: "Sélection maison, cadeaux et accessoires avec livraison COD partout en Algérie.",
        theme: JSON.stringify({
          template: "minimal",
          primaryColor: "#0f9d58",
          showPrices: true,
          showStock: true,
          heroTitle: "Des essentiels choisis pour votre quotidien",
        }),
        productIds: JSON.stringify(PRODUCTS.slice(0, 10).map((product) => product.id)),
        contact: JSON.stringify({
          phone: "0550001100",
          whatsapp: "0550001100",
          email: "demo@atelier-nour.dz",
          address: "Alger, Algérie",
        }),
        isActive: true,
      },
    });

    await client.cannedResponse.createMany({
      data: [
        { id: "demo-canned-01", shortCode: "demo_disponible", content: "Salam {{name}}, oui le produit est disponible. Livraison à {{wilaya}} en 24–72 h.", description: "Disponibilité et délai" },
        { id: "demo-canned-02", shortCode: "demo_confirmation", content: "Votre commande {{order_number}} est confirmée ✅ Total COD : {{total}} DA.", description: "Confirmation commande" },
        { id: "demo-canned-03", shortCode: "demo_suivi", content: "Votre colis est en route avec {{provider}}. Suivi : {{tracking_number}}.", description: "Suivi livraison" },
        { id: "demo-canned-04", shortCode: "demo_absent", content: "Le livreur n'a pas pu vous joindre. Quel créneau vous convient pour une nouvelle tentative ?", description: "Client absent" },
      ],
    });

    await client.whatsAppTemplate.createMany({
      data: [
        { id: "demo-template-01", name: "demo_confirmation_commande", content: "Salam {{name}}, commande {{order_number}} confirmée. Total : {{total}} DA.", language: "fr", category: "transaction" },
        { id: "demo-template-02", name: "demo_confirmation_ar", content: "سلام {{name}}، تم تأكيد الطلب {{order_number}}. المجموع {{total}} دج.", language: "ar", category: "transaction" },
        { id: "demo-template-03", name: "demo_relance_confirmation", content: "Bonjour {{name}}, souhaitez-vous toujours confirmer votre commande ?", language: "fr", category: "service" },
      ],
    });

    const aiSessionId = "demo-ai-session-01";
    await client.aiChatSession.create({
      data: {
        id: aiSessionId,
        title: "Brief opérationnel du matin",
        createdAt: daysAgo(0, 8),
      },
    });
    const aiMessages = [
      ["user", "Donne-moi les priorités COD de ce matin.", null],
      ["assistant", "8 commandes demandent une action : 3 confirmations WhatsApp, 2 colis en sortie de livraison, 2 COD collectés non remisés et 1 stock faible.", JSON.stringify([{ name: "get_operational_brief", result: { confirmations: 3, outForDelivery: 2, pendingRemittance: 2, lowStock: 1 } }])],
      ["user", "Quel dossier dois-je vérifier en premier ?", null],
      ["assistant", "Commencez par DZ-DEMO-0001 : la cliente a confirmé en arabe, l'adresse est complète et elle demande un appel avant expédition. Le dossier est prêt pour validation humaine.", JSON.stringify([{ name: "get_order", result: { orderNumber: "DZ-DEMO-0001", risk: "low", nextAction: "confirm" } }])],
    ] as const;
    for (let index = 0; index < aiMessages.length; index += 1) {
      const [role, content, toolCalls] = aiMessages[index]!;
      await client.aiChatMessage.create({
        data: {
          id: `demo-ai-message-${index + 1}`,
          sessionId: aiSessionId,
          role,
          content,
          toolCalls,
          createdAt: daysAgo(0, 8, index * 3),
        },
      });
    }

    const auditOrders = createdOrders.slice(0, 12);
    for (let index = 0; index < auditOrders.length; index += 1) {
      const order = auditOrders[index]!;
      await client.auditLog.create({
        data: {
          id: `demo-audit-${String(index + 1).padStart(2, "0")}`,
          action: index === 0 ? "order.confirmed.from_whatsapp" : "order.status.changed",
          entity: "order",
          entityId: order.id,
          actor: index % 3 === 0 ? "owner" : "system",
          metadata: JSON.stringify({
            demo: true,
            orderStatus: order.status,
            source: index === 0 ? "whatsapp_ar" : "workflow",
          }),
          createdAt: hoursAfter(order.createdAt, 2),
        },
      });
    }

    await client.setting.createMany({
      data: [
        { key: DEMO_MARKER_KEY, value: ALGERIAN_DEMO_VERSION },
        { key: DEMO_CREATED_AT_KEY, value: now().toISOString() },
      ],
    });
  } catch (error) {
    await clearDemoRecords(client).catch(() => undefined);
    throw error;
  }

  return getAlgerianDemoStatus(client);
}
