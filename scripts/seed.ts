/**
 * Seed script — populates the dev SQLite with realistic Algerian COD data.
 *
 * Usage: bun run scripts/seed.ts
 *
 * Creates:
 *   - 3 categories (Électronique, Mode, Maison)
 *   - 15 products (realistic Algerian e-commerce items, DZD prices)
 *   - 5 customers (Algerian names, wilayas, phones)
 *   - 8 orders (various statuses, covering the full lifecycle)
 *   - 2 deliveries (for confirmed/shipped orders)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding dev database...");

  // Clean existing data (order matters for FK constraints)
  await prisma.notification.deleteMany();
  await prisma.aiChatMessage.deleteMany();
  await prisma.aiChatSession.deleteMany();
  await prisma.returnNote.deleteMany();
  await prisma.return.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.automation.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.pollingEvent.deleteMany();
  await prisma.whatsAppTemplate.deleteMany();
  await prisma.wilayaRiskProfile.deleteMany();

  // ─── Categories ────────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.create({ data: { name: "Électronique" } }),
    prisma.category.create({ data: { name: "Mode" } }),
    prisma.category.create({ data: { name: "Maison" } }),
  ]);
  console.log(`  ✅ ${categories.length} categories`);

  // ─── Products ──────────────────────────────────────────────────────────────
  const products = await Promise.all([
    prisma.product.create({ data: { name: "Écouteurs Bluetooth JBL", sku: "ELEC-001", price: 4500, cost: 2800, stock: 50, categoryId: categories[0]!.id } }),
    prisma.product.create({ data: { name: "Chargeur Rapide USB-C 65W", sku: "ELEC-002", price: 2200, cost: 1200, stock: 80, categoryId: categories[0]!.id } }),
    prisma.product.create({ data: { name: "Montre Connectée Smart Watch", sku: "ELEC-003", price: 8500, cost: 5500, stock: 25, categoryId: categories[0]!.id } }),
    prisma.product.create({ data: { name: "Power Bank 20000mAh", sku: "ELEC-004", price: 3200, cost: 1800, stock: 3, lowStockThreshold: 5, categoryId: categories[0]!.id } }),
    prisma.product.create({ data: { name: "Coque iPhone 14 Pro", sku: "ELEC-005", price: 1200, cost: 400, stock: 100, categoryId: categories[0]!.id } }),
    prisma.product.create({ data: { name: "Câble HDMI 2m", sku: "ELEC-006", price: 800, cost: 300, stock: 60, categoryId: categories[0]!.id } }),
    prisma.product.create({ data: { name: "Robe d'été Algérienne", sku: "MODE-001", price: 3500, cost: 1500, stock: 40, categoryId: categories[1]!.id } }),
    prisma.product.create({ data: { name: "Chemise Homme Coton", sku: "MODE-002", price: 2800, cost: 1200, stock: 35, categoryId: categories[1]!.id } }),
    prisma.product.create({ data: { name: "Basket Sport Homme", sku: "MODE-003", price: 6500, cost: 3500, stock: 20, categoryId: categories[1]!.id } }),
    prisma.product.create({ data: { name: "Sac à Main Femme", sku: "MODE-004", price: 4200, cost: 1800, stock: 15, categoryId: categories[1]!.id } }),
    prisma.product.create({ data: { name: "Coffret Thé Décoré", sku: "MAIS-001", price: 5500, cost: 2500, stock: 18, categoryId: categories[2]!.id } }),
    prisma.product.create({ data: { name: "Tapis de Prière Premium", sku: "MAIS-002", price: 3800, cost: 1600, stock: 45, categoryId: categories[2]!.id } }),
    prisma.product.create({ data: { name: "Ensemble Bougie Parfumée", sku: "MAIS-003", price: 2500, cost: 900, stock: 30, categoryId: categories[2]!.id } }),
    prisma.product.create({ data: { name: "Miroir Mural Décoratif", sku: "MAIS-004", price: 4800, cost: 2200, stock: 2, lowStockThreshold: 5, categoryId: categories[2]!.id } }),
    prisma.product.create({ data: { name: "Coussin Brodé Main", sku: "MAIS-005", price: 1800, cost: 700, stock: 50, categoryId: categories[2]!.id } }),
  ]);
  console.log(`  ✅ ${products.length} products`);

  // ─── Customers ─────────────────────────────────────────────────────────────
  const customers = await Promise.all([
    prisma.customer.create({ data: { name: "Ahmed Benali", phone: "0555123456", wilaya: "Alger", commune: "Bab El Oued", address: "Rue Didouche Mourad" } }),
    prisma.customer.create({ data: { name: "Fatima Zohra", phone: "0661987654", wilaya: "Oran", commune: "Es Senia", address: "Cité 1000 Logements" } }),
    prisma.customer.create({ data: { name: "Karim Haddad", phone: "0770456789", wilaya: "Constantine", commune: "Constantine", address: "Rue Larbi Ben M'hidi" } }),
    prisma.customer.create({ data: { name: "Amina Cherif", phone: "0555789012", wilaya: "Sétif", commune: "Sétif", address: "Avenue 8 Mai 1945" } }),
    prisma.customer.create({ data: { name: "Yacine Brahimi", phone: "0661345678", wilaya: "Annaba", commune: "Annaba", address: "Boulevard de la Révolution" } }),
  ]);
  console.log(`  ✅ ${customers.length} customers`);

  // ─── Orders ────────────────────────────────────────────────────────────────
  const orders = [
    {
      orderNumber: "ORD-0001",
      status: "delivered" as const,
      customerId: customers[0]!.id,
      items: [{ product: products[0]!, quantity: 1 }, { product: products[4]!, quantity: 2 }],
      wilaya: "Alger", commune: "Bab El Oued", address: "Rue Didouche Mourad", phone: "0555123456",
      source: "whatsapp" as const,
      deliveredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
    {
      orderNumber: "ORD-0002",
      status: "delivered" as const,
      customerId: customers[1]!.id,
      items: [{ product: products[6]!, quantity: 1 }],
      wilaya: "Oran", commune: "Es Senia", address: "Cité 1000 Logements", phone: "0661987654",
      source: "whatsapp" as const,
      deliveredAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      orderNumber: "ORD-0003",
      status: "shipped" as const,
      customerId: customers[2]!.id,
      items: [{ product: products[2]!, quantity: 1 }],
      wilaya: "Constantine", commune: "Constantine", address: "Rue Larbi Ben M'hidi", phone: "0770456789",
      source: "tiktok" as const,
      shippedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      orderNumber: "ORD-0004",
      status: "confirmed" as const,
      customerId: customers[3]!.id,
      items: [{ product: products[10]!, quantity: 1 }, { product: products[14]!, quantity: 2 }],
      wilaya: "Sétif", commune: "Sétif", address: "Avenue 8 Mai 1945", phone: "0555789012",
      source: "whatsapp" as const,
      confirmedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
    {
      orderNumber: "ORD-0005",
      status: "pending" as const,
      customerId: customers[4]!.id,
      items: [{ product: products[8]!, quantity: 1 }],
      wilaya: "Annaba", commune: "Annaba", address: "Boulevard de la Révolution", phone: "0661345678",
      source: "whatsapp" as const,
    },
    {
      orderNumber: "ORD-0006",
      status: "draft" as const,
      customerId: customers[0]!.id,
      items: [{ product: products[1]!, quantity: 1 }],
      wilaya: "Alger", commune: "Bab El Oued", address: "Rue Didouche Mourad", phone: "0555123456",
      source: "whatsapp" as const,
    },
    {
      orderNumber: "ORD-0007",
      status: "returned" as const,
      customerId: customers[1]!.id,
      items: [{ product: products[9]!, quantity: 1 }],
      wilaya: "Oran", commune: "Es Senia", address: "Cité 1000 Logements", phone: "0661987654",
      source: "manual" as const,
    },
    {
      orderNumber: "ORD-0008",
      status: "cancelled" as const,
      customerId: customers[2]!.id,
      items: [{ product: products[5]!, quantity: 3 }],
      wilaya: "Constantine", commune: "Constantine", address: "Rue Larbi Ben M'hidi", phone: "0770456789",
      source: "manual" as const,
    },
  ];

  for (const orderData of orders) {
    const { items, ...orderFields } = orderData;
    const itemsTotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
    const deliveryCost = 600;
    await prisma.order.create({
      data: {
        ...orderFields,
        totalPrice: itemsTotal + deliveryCost,
        deliveryCost,
        sourceMetadata: null,
        items: {
          create: items.map((i) => ({
            productId: i.product.id,
            productName: i.product.name,
            quantity: i.quantity,
            unitPrice: i.product.price,
            total: i.product.price * i.quantity,
          })),
        },
      },
    });
  }
  console.log(`  ✅ ${orders.length} orders`);

  // ─── Deliveries (for shipped + delivered orders) ───────────────────────────
  const shippedOrders = await prisma.order.findMany({
    where: { status: { in: ["shipped", "delivered"] } },
  });
  for (const order of shippedOrders) {
    await prisma.delivery.create({
      data: {
        orderId: order.id,
        provider: "yalidine",
        trackingNumber: `YAL-${order.orderNumber.split("-")[1]}`,
        cost: 600,
        status: order.status === "delivered" ? "delivered" : "in_transit",
      },
    });
  }
  console.log(`  ✅ ${shippedOrders.length} deliveries`);

  console.log("\n✅ Seed complete!");
  console.log("   3 categories, 15 products, 5 customers, 8 orders, 2 deliveries");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// ─── Conversations + Messages (for the inbox) ─────────────────────────────────
async function seedConversations() {
  console.log("\n💬 Seeding conversations...");

  const conversations = [
    {
      channel: "whatsapp",
      contactName: "Ahmed Benali",
      contactPhone: "0555123456",
      sourceId: "wa-001",
      lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      unreadCount: 2,
      messages: [
        { body: "السلام عليكم", direction: "inbound", timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000) },
        { body: "وعليكم السلام، كيفاش نقدر نعاونك؟", direction: "outbound", timestamp: new Date(Date.now() - 2.8 * 60 * 60 * 1000) },
        { body: "بغيت نشرى iPhone 14 Case ب 1200 دج ف Alger، رقمي 0555123456", direction: "inbound", timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        { body: "اسمي Ahmed", direction: "inbound", timestamp: new Date(Date.now() - 1.9 * 60 * 60 * 1000) },
      ],
    },
    {
      channel: "whatsapp",
      contactName: "Fatima Zohra",
      contactPhone: "0661987654",
      sourceId: "wa-002",
      lastMessageAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      unreadCount: 1,
      messages: [
        { body: "Bonjour, je veux commander 2x robe d'été 3500 DA Oran, 0661987654", direction: "inbound", timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000) },
        { body: "Je m'appelle Fatima", direction: "inbound", timestamp: new Date(Date.now() - 4.9 * 60 * 60 * 1000) },
      ],
    },
    {
      channel: "whatsapp",
      contactName: "Karim Haddad",
      contactPhone: "0770456789",
      sourceId: "wa-003",
      lastMessageAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      unreadCount: 0,
      messages: [
        { body: "نبغي نشري ٣ قطع من basket sport ب 6500 دج كل وحدة ف Constantine", direction: "inbound", timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        { body: "تم تأكيد طلبك، سنتواصل معك قريباً", direction: "outbound", timestamp: new Date(Date.now() - 23 * 60 * 60 * 1000) },
      ],
    },
    {
      channel: "tiktok",
      contactName: "Amina Cherif",
      contactPhone: "0555789012",
      sourceId: "tt-001",
      lastMessageAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      unreadCount: 1,
      messages: [
        { body: "3x basket sport 6500 DA Constantine 0770456789", direction: "inbound", timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000) },
      ],
    },
    {
      channel: "whatsapp",
      contactName: "Yacine Brahimi",
      contactPhone: "0661345678",
      sourceId: "wa-004",
      lastMessageAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      unreadCount: 0,
      messages: [
        { body: "بغيت نشرى montre connectée ب 8500 دج ف Annaba", direction: "inbound", timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000) },
        { body: "تم الشحن، رقم التتبع: YAL-0003", direction: "outbound", timestamp: new Date(Date.now() - 47 * 60 * 60 * 1000) },
      ],
    },
  ];

  for (const conv of conversations) {
    const { messages, ...convData } = conv;
    const created = await prisma.conversation.create({
      data: {
        ...convData,
        messages: {
          create: messages,
        },
      },
      include: { messages: true },
    });
    console.log(`  ✅ ${created.contactName} (${created.messages.length} messages)`);
  }
}

await seedConversations();
