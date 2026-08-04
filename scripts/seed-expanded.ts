/**
 * Expanded seed script — populates the dev SQLite with realistic Algerian COD data.
 *
 * Usage: bun run scripts/seed-expanded.ts
 *
 * Creates:
 *   - 4 categories (Électronique, Mode, Maison, Beauté)
 *   - 20 products (realistic Algerian e-commerce items, DZD prices, varied stock)
 *   - 20 customers (Algerian names across multiple wilayas)
 *   - 50 orders (various statuses, covering the full lifecycle, spread across 14 days)
 *   - 30 deliveries (multiple providers, various statuses)
 *   - 10 returns (mix of return + exchange, various statuses)
 *   - 15 expenses (various categories)
 *
 * Designed to give the founder enough data to review every page meaningfully.
 */
import { db as prisma } from "./db";

// Realistic Algerian names + wilayas + communes (matching data/wilayas.json names)
const WILAYA_COMMUNE: Array<{ wilaya: string; commune: string }> = [
  { wilaya: "Alger", commune: "Bab El Oued" },
  { wilaya: "Alger", commune: "Hussein Dey" },
  { wilaya: "Alger", commune: "Bab Ezzouar" },
  { wilaya: "Alger", commune: "Bir Mourad Raïs" },
  { wilaya: "Oran", commune: "Es Senia" },
  { wilaya: "Oran", commune: "Arzew" },
  { wilaya: "Constantine", commune: "Constantine" },
  { wilaya: "Constantine", commune: "El Khroub" },
  { wilaya: "Sétif", commune: "Sétif" },
  { wilaya: "Sétif", commune: "El Eulma" },
  { wilaya: "Annaba", commune: "Annaba" },
  { wilaya: "Annaba", commune: "Bouchegouf" },
  { wilaya: "Blida", commune: "Blida" },
  { wilaya: "Blida", commune: "Boufarik" },
  { wilaya: "Batna", commune: "Batna" },
  { wilaya: "Batna", commune: "Barika" },
  { wilaya: "Tizi Ouzou", commune: "Tizi Ouzou" },
  { wilaya: "Tizi Ouzou", commune: "Azazga" },
  { wilaya: "Béjaïa", commune: "Béjaïa" },
  { wilaya: "Béjaïa", commune: "Akbou" },
  { wilaya: "Tlemcen", commune: "Tlemcen" },
  { wilaya: "Tlemcen", commune: "Maghnia" },
  { wilaya: "Tiaret", commune: "Tiaret" },
  { wilaya: "Tiaret", commune: "Sougueur" },
  { wilaya: "Djelfa", commune: "Djelfa" },
  { wilaya: "Djelfa", commune: "Aïn Oussera" },
  { wilaya: "Skikda", commune: "Skikda" },
  { wilaya: "Skikda", commune: "Azzaba" },
  { wilaya: "Médéa", commune: "Médéa" },
  { wilaya: "Médéa", commune: "Berrouaghia" },
];

const CUSTOMER_NAMES: Array<{ name: string; phone: string }> = [
  { name: "Ahmed Benali", phone: "0555123456" },
  { name: "Fatima Zohra", phone: "0661987654" },
  { name: "Karim Haddad", phone: "0770456789" },
  { name: "Amina Cherif", phone: "0555789012" },
  { name: "Yacine Brahimi", phone: "0661345678" },
  { name: "Nadia Belkacem", phone: "0555345678" },
  { name: "Mohamed Saidi", phone: "0770891234" },
  { name: "Sofiane Mazouz", phone: "0661567890" },
  { name: "Leila Mansouri", phone: "0555678901" },
  { name: "Rachid Amrani", phone: "0770234567" },
  { name: "Yasmine Boumediene", phone: "0555901234" },
  { name: "Tarek Ziani", phone: "0661789012" },
  { name: "Salima Khelifi", phone: "0555123789" },
  { name: "Bilal Tahar", phone: "0770456123" },
  { name: "Imene Ouali", phone: "0555890456" },
  { name: "Nabil Hamadi", phone: "0661456789" },
  { name: "Sara Benyahia", phone: "0555789456" },
  { name: "Adel Ferhati", phone: "0770123890" },
  { name: "Khadidja Slimani", phone: "0661234567" },
  { name: "Omar Boudjelal", phone: "0555456789" },
];

const ADDRESSES: Array<string> = [
  "Rue Didouche Mourad",
  "Cité 1000 Logements, Bât B",
  "Avenue 8 Mai 1945",
  "Boulevard de la Révolution",
  "Rue Larbi Ben M'hidi",
  "Cité AADL, Lot 23",
  "Rue des Frères Bouadou",
  "Quartier El Hidhab",
  "Cité Diar El Mahcoul",
  "Rue Hassiba Ben Bouali",
  "Avenue de l'ALN",
  "Cité 5 Juillet",
  "Rue Mohamed V",
  "Quartier Bel Air",
  "Cité Ben Omar",
  "Rue Khelifa Boukhalfa",
];

const ORDER_STATUSES = [
  "pending", "pending", "pending", "pending", "pending",
  "confirmed", "confirmed", "confirmed", "confirmed",
  "shipped", "shipped", "shipped", "shipped", "shipped",
  "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered",
  "returned", "returned",
  "refused", "refused",
  "cancelled", "cancelled",
] as const;

const DELIVERY_PROVIDERS = ["yalidine", "maystro", "zr_express", "noest"] as const;

const RETURN_STATUSES = ["requested", "requested", "approved", "approved", "completed", "completed", "rejected"] as const;
const RETURN_TYPES = ["return", "return", "return", "exchange", "exchange"] as const;

const EXPENSE_CATEGORIES = ["shipping", "advertising", "supplies", "salary", "rent", "utilities", "other"];
const EXPENSE_DESCRIPTIONS = [
  "Frais Yalidine - lot semaine",
  "Publicité Facebook Ads",
  "Achat cartons d'emballage",
  "Salaire livreur",
  "Loyer local stockage",
  "Facture électricité",
  "Achat ruban adhésif",
  "Frais Maystro - lot jour",
  "Instagram sponsorisé",
  "Achat étiquettes",
  "Frais ZR Express",
  "Carburant livreur",
  "Frais NOEST Express",
  "Matériel bureau",
  "Maintenance ordinateur",
];

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(days: number, hourVariance = true): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (hourVariance) {
    d.setHours(randomInt(8, 20), randomInt(0, 59), 0, 0);
  }
  return d;
}

async function main() {
  console.log("🌱 Seeding expanded dev database...");

  // Clean existing data (order matters for FK constraints)
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
  await prisma.whatsAppTemplate.deleteMany();
  await prisma.wilayaRiskProfile.deleteMany();
  await prisma.counter.deleteMany();

  // ─── Categories ────────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.create({ data: { name: "Électronique" } }),
    prisma.category.create({ data: { name: "Mode" } }),
    prisma.category.create({ data: { name: "Maison" } }),
    prisma.category.create({ data: { name: "Beauté" } }),
  ]);
  console.log(`  ✅ ${categories.length} categories`);

  // ─── Products (20) ─────────────────────────────────────────────────────────
  const productData = [
    { name: "Écouteurs Bluetooth JBL", sku: "ELEC-001", price: 4500, cost: 2800, stock: 50, categoryId: 0 },
    { name: "Chargeur Rapide USB-C 65W", sku: "ELEC-002", price: 2200, cost: 1200, stock: 80, categoryId: 0 },
    { name: "Montre Connectée Smart Watch", sku: "ELEC-003", price: 8500, cost: 5500, stock: 25, categoryId: 0 },
    { name: "Power Bank 20000mAh", sku: "ELEC-004", price: 3200, cost: 1800, stock: 3, lowStockThreshold: 5, categoryId: 0 },
    { name: "Coque iPhone 14 Pro", sku: "ELEC-005", price: 1200, cost: 400, stock: 100, categoryId: 0 },
    { name: "Câble HDMI 2m", sku: "ELEC-006", price: 800, cost: 300, stock: 60, categoryId: 0 },
    { name: "Souris Sans Fil Logitech", sku: "ELEC-007", price: 1800, cost: 700, stock: 40, categoryId: 0 },
    { name: "Clavier Mécanique RGB", sku: "ELEC-008", price: 5500, cost: 3000, stock: 12, categoryId: 0 },
    { name: "Robe d'été Algérienne", sku: "MODE-001", price: 3500, cost: 1500, stock: 40, categoryId: 1 },
    { name: "Chemise Homme Coton", sku: "MODE-002", price: 2800, cost: 1200, stock: 35, categoryId: 1 },
    { name: "Basket Sport Homme", sku: "MODE-003", price: 6500, cost: 3500, stock: 20, categoryId: 1 },
    { name: "Sac à Main Femme", sku: "MODE-004", price: 4200, cost: 1800, stock: 15, categoryId: 1 },
    { name: "Djellaba Femme Premium", sku: "MODE-005", price: 5200, cost: 2400, stock: 28, categoryId: 1 },
    { name: "Coffret Thé Décoré", sku: "MAIS-001", price: 5500, cost: 2500, stock: 18, categoryId: 2 },
    { name: "Tapis de Prière Premium", sku: "MAIS-002", price: 3800, cost: 1600, stock: 45, categoryId: 2 },
    { name: "Ensemble Bougie Parfumée", sku: "MAIS-003", price: 2500, cost: 900, stock: 30, categoryId: 2 },
    { name: "Miroir Mural Décoratif", sku: "MAIS-004", price: 4800, cost: 2200, stock: 2, lowStockThreshold: 5, categoryId: 2 },
    { name: "Coussin Brodé Main", sku: "MAIS-005", price: 1800, cost: 700, stock: 50, categoryId: 2 },
    { name: "Parfum Oud Royal 50ml", sku: "BEAU-001", price: 6800, cost: 3200, stock: 22, categoryId: 3 },
    { name: "Huile de Barbe Premium", sku: "BEAU-002", price: 1500, cost: 500, stock: 60, categoryId: 3 },
  ];

  const products = await Promise.all(
    productData.map((p) =>
      prisma.product.create({
        data: {
          name: p.name,
          sku: p.sku,
          price: p.price,
          cost: p.cost,
          stock: p.stock,
          lowStockThreshold: p.lowStockThreshold ?? 5,
          categoryId: categories[p.categoryId]!.id,
          isActive: true,
        },
      }),
    ),
  );
  console.log(`  ✅ ${products.length} products`);

  // ─── Customers (20) ────────────────────────────────────────────────────────
  const customers = await Promise.all(
    CUSTOMER_NAMES.map(async (c, i) => {
      const loc = WILAYA_COMMUNE[i % WILAYA_COMMUNE.length]!;
      const address = randomFrom(ADDRESSES);
      return prisma.customer.create({
        data: {
          name: c.name,
          phone: c.phone,
          wilaya: loc.wilaya,
          commune: loc.commune,
          address,
          orderCount: i < 5 ? randomInt(3, 8) : i < 12 ? randomInt(1, 3) : randomInt(0, 1),
          totalSpent: i < 5 ? randomInt(15000, 45000) : i < 12 ? randomInt(3000, 12000) : randomInt(0, 5000),
          riskScore: i % 7 === 0 ? randomInt(5, 8) : i % 11 === 0 ? randomInt(3, 5) : 0,
          notes: i % 4 === 0 ? "Client fidèle" : null,
          createdAt: daysAgo(randomInt(1, 60)),
        },
      });
    }),
  );
  console.log(`  ✅ ${customers.length} customers`);

  // ─── Orders (50) — spread across 14 days, varied statuses ──────────────────
  const sources = ["whatsapp", "whatsapp", "whatsapp", "whatsapp", "manual", "manual", "storefront", "tiktok"] as const;
  let orderSeq = 1;

  for (let i = 0; i < 50; i++) {
    const customer = randomFrom(customers);
    const itemCount = randomInt(1, 3);
    const itemsPicked: Array<{ product: typeof products[0]; quantity: number }> = [];
    for (let j = 0; j < itemCount; j++) {
      const product = randomFrom(products);
      if (!itemsPicked.some((it) => it.product.id === product.id)) {
        itemsPicked.push({ product, quantity: randomInt(1, 3) });
      }
    }
    if (itemsPicked.length === 0) {
      itemsPicked.push({ product: products[0]!, quantity: 1 });
    }

    const itemsTotal = itemsPicked.reduce((sum, it) => sum + it.product.price * it.quantity, 0);
    const deliveryCost = randomFrom([400, 500, 600, 700, 800]);
    const status = ORDER_STATUSES[i % ORDER_STATUSES.length]!;
    const dayOffset = Math.floor(i / 4);
    const createdAt = daysAgo(dayOffset, true);
    const loc = WILAYA_COMMUNE.find((w) => w.wilaya === customer.wilaya) ?? WILAYA_COMMUNE[0]!;
    const source = randomFrom(sources);

    await prisma.order.create({
      data: {
        orderNumber: `ORD-${String(orderSeq).padStart(4, "0")}`,
        status,
        customerId: customer.id,
        wilaya: customer.wilaya ?? loc.wilaya,
        commune: customer.commune ?? loc.commune,
        address: customer.address ?? randomFrom(ADDRESSES),
        phone: customer.phone,
        totalPrice: itemsTotal + deliveryCost,
        deliveryCost,
        source,
        sourceMetadata: source === "storefront" ? JSON.stringify({ storefrontSlug: "sahelflow-demo" }) : null,
        createdAt,
        items: {
          create: itemsPicked.map((it) => ({
            productId: it.product.id,
            productName: it.product.name,
            quantity: it.quantity,
            unitPrice: it.product.price,
            total: it.product.price * it.quantity,
          })),
        },
      },
    });

    orderSeq++;
  }
  console.log(`  ✅ 50 orders`);

  // ─── Deliveries (30) ───────────────────────────────────────────────────────
  const deliveryOrders = await prisma.order.findMany({
    where: { status: { in: ["confirmed", "shipped", "delivered", "returned", "refused"] } },
    take: 30,
  });

  let deliverySeq = 1;
  for (const order of deliveryOrders) {
    const provider = randomFrom(DELIVERY_PROVIDERS);
    let deliveryStatus: string;
    if (order.status === "delivered") deliveryStatus = "delivered";
    else if (order.status === "returned") deliveryStatus = "returned";
    else if (order.status === "refused") deliveryStatus = "refused";
    else if (order.status === "shipped") deliveryStatus = randomFrom(["in_transit", "at_hub", "out_for_delivery"]);
    else deliveryStatus = randomFrom(["pending", "created", "picked_up"]);

    await prisma.delivery.create({
      data: {
        orderId: order.id,
        provider,
        trackingNumber: `${provider.toUpperCase()}-${String(deliverySeq).padStart(5, "0")}`,
        cost: randomFrom([400, 500, 600, 700, 800]),
        status: deliveryStatus,
        createdAt: order.createdAt,
      },
    });
    deliverySeq++;
  }
  console.log(`  ✅ ${deliveryOrders.length} deliveries`);

  // ─── Returns (10) ──────────────────────────────────────────────────────────
  const returnableOrders = await prisma.order.findMany({
    where: { status: { in: ["delivered", "returned"] } },
    take: 10,
  });

  for (const order of returnableOrders) {
    await prisma.return.create({
      data: {
        orderId: order.id,
        type: randomFrom(RETURN_TYPES),
        status: randomFrom(RETURN_STATUSES),
        reason: randomFrom([
          "Taille ne convient pas",
          "Produit défectueux",
          "Client absent",
          "Mauvaise couleur livrée",
          "Changement d'avis",
          "Produit endommagé pendant le transport",
        ]),
        createdAt: daysAgo(randomInt(0, 7)),
      },
    });
  }
  console.log(`  ✅ ${returnableOrders.length} returns`);

  // ─── Expenses (15) ─────────────────────────────────────────────────────────
  for (let i = 0; i < 15; i++) {
    await prisma.expense.create({
      data: {
        category: randomFrom(EXPENSE_CATEGORIES),
        notes: EXPENSE_DESCRIPTIONS[i] ?? "Dépense diverse",
        amount: randomInt(500, 15000),
        date: daysAgo(randomInt(0, 30), false),
      },
    });
  }
  console.log(`  ✅ 15 expenses`);

  // ─── Counter (for order number sequence) ───────────────────────────────────
  await prisma.counter.create({
    data: {
      name: "ORD",
      value: orderSeq,
    },
  });

  console.log("\n✅ Expanded seed complete!");
  console.log("   4 categories, 20 products, 20 customers, 50 orders, 30 deliveries, 10 returns, 15 expenses");
  console.log("   Run 'bun run dev' to view the app with realistic data.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
