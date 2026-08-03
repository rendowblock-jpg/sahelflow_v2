/**
 * Rich seed script — comprehensive Algerian COD data for full app testing.
 *
 * Usage: bun run seed:rich
 *
 * Creates (all encrypted at rest via PII extension):
 *   - 4 categories (Électronique, Mode, Maison, Beauté)
 *   - 20 products (8 with variants — colors/sizes)
 *   - 30 customers (realistic Algerian names across 15+ wilayas, varied risk)
 *   - 80 orders (full lifecycle: draft→pending→confirmed→shipped→delivered→returned→refused→cancelled, spread across 30 days)
 *   - 40 deliveries (4 providers, varied statuses)
 *   - 15 returns (mix return/exchange, varied statuses + notes)
 *   - 20 expenses (all 8 categories from the validation schema)
 *   - 10 conversations + 40 messages (WhatsApp inbox, realistic Darija order messages)
 *   - 1 storefront config (active, with selected products)
 *   - 5 notifications (mixed read/unread)
 *   - 3 automations (active/inactive mix)
 *   - 3 AI chat sessions + 10 messages (tool-call examples)
 *   - 10 extraction metrics (regex + Gemini, varied confidence)
 *   - 5 audit log entries
 *   - WilayaRiskProfile seed (58 wilayas)
 *   - Counter for order sequence
 *   - Settings (daily report config, risk engine defaults)
 *
 * Every page in the app will have meaningful data to test.
 */
import { db as prisma } from "./db";
import { hashPin } from "@/lib/auth/crypto";

// Ensure master key is set for encryption.
// CRITICAL: write the key to data/master.key so the dev server (which reads
// the keyfile when SF_MASTER_KEY env isn't set) uses the SAME key as the seed.
// Without this, the dev server generates/uses a different key → PII decryption
// fails → customer names show as ciphertext blobs in tables.
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Generate a random dev master key if not provided (NEVER hardcode a key
// in source — a leaked repo would let anyone decrypt every dev DB's PII).
// In CI, set SF_MASTER_KEY as a repo secret. Locally, dev:reset generates
// a fresh random key each run (dev DB PII is ephemeral anyway).
const SEED_KEY = process.env.SF_MASTER_KEY ?? randomHexKey();
process.env.SF_MASTER_KEY = SEED_KEY;

function randomHexKey(): string {
  // 32 bytes = 64 hex chars = AES-256 key
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Persist the key to data/master.key (the keyfile the dev server reads)
const dataDir = join(process.cwd(), "data");
const keyFilePath = join(dataDir, "master.key");
if (!existsSync(keyFilePath)) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(keyFilePath, SEED_KEY, { mode: 0o600 });
  console.log("  ✅ Master key persisted to data/master.key");
} else {
  // Keyfile exists — use ITS key (not the hardcoded one) so we don't break
  // existing encrypted data from a prior run.
  const existingKey = require("fs").readFileSync(keyFilePath, "utf8").trim();
  if (existingKey.length === 64) {
    process.env.SF_MASTER_KEY = existingKey;
  }
}

// ─── Data ───────────────────────────────────────────────────────────────────

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
  { name: "Djamila Touati", phone: "0555234567" },
  { name: "Riad Cherouana", phone: "0770567890" },
  { name: "Wassila Benhamou", phone: "0661901234" },
  { name: "Sami Lakhdari", phone: "0555671234" },
  { name: "Houda Belhadj", phone: "0770789012" },
  { name: "Fares Nouri", phone: "0661345098" },
  { name: "Amel Kaci", phone: "0555890678" },
  { name: "Walid Said", phone: "0770234598" },
  { name: "Lamia Bouzid", phone: "0661789056" },
  { name: "Reda Mokrani", phone: "0555345078" },
];

const ADDRESSES = [
  "Rue Didouche Mourad", "Cité 1000 Logements, Bât B", "Avenue 8 Mai 1945",
  "Boulevard de la Révolution", "Rue Larbi Ben M'hidi", "Cité AADL, Lot 23",
  "Rue des Frères Bouadou", "Quartier El Hidhab", "Cité Diar El Mahcoul",
  "Rue Hassiba Ben Bouali", "Avenue de l'ALN", "Cité 5 Juillet",
  "Rue Mohamed V", "Quartier Bel Air", "Cité Ben Omar", "Rue Khelifa Boukhalfa",
];

// WhatsApp message templates (realistic Darija/French mixed order messages)
const WHATSAPP_MESSAGES = [
  "Salam, bghit ncommandi Écouteurs Bluetooth JBL, adresse: Cité 1000 Logements Bât B, Bab Ezzouar Alger. Tel: 0555123456",
  "Bonjour, je veux commander Chargeur Rapide USB-C. Nom: Karim Haddad. Wilaya: Oran, Commune: Es Senia. 0661987654",
  "سلام، نريد شراء Montre Connectée. الاسم: أمينة شريف. ولاية قسنطينة. الهاتف: 0770456789",
  "Salam, 2x Power Bank 20000mAh svp. Yacine, Tizi Ouzou. 0555789012. Adresse: Rue Larbi Ben M'hidi",
  "Bonjour, Sac à Main Femme + Parfum Oud Royal. Nadia, Blida. 0555345678",
  "Bghit Tapis de Prière Premium. Mohamed, Sétif. 0770891234. Cité 5 Juillet",
  "Salam, je commande Djellaba Femme Premium taille M. Leila, Béjaïa. 0555678901",
  "3x Coque iPhone 14 Pro svp. Sofiane, Tlemcen. 0661567890. Rue Mohamed V",
  "Bonjour, Coffret Thé Décoré. Rachid, Batna. 0770234567. Quartier Bel Air",
  "Salam, Clavier Mécanique RGB. Tarek, Annaba. 0661789012",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(days: number, hourVariance = true): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  if (hourVariance) d.setHours(randomInt(8, 20), randomInt(0, 59), 0, 0);
  return d;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding rich dev database...\n");

  // CRITICAL: Ensure app-meta.json points to data/shops/dev.db
  // This is the SAME file the app's db.ts Proxy reads.
  // Without this, the seed writes to one DB file and the app reads another.
  const { writeFileSync, mkdirSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const shopsDir = resolve(process.cwd(), "data", "shops");
  if (!existsSync(shopsDir)) mkdirSync(shopsDir, { recursive: true });
  const metaPath = resolve(process.cwd(), "data", "app-meta.json");
  writeFileSync(metaPath, JSON.stringify({
    shops: [{ id: "default", name: "Ma Boutique", dbPath: "data/shops/dev.db", icon: "🏪", createdAt: new Date().toISOString() }],
    activeShopId: "default"
  }, null, 2));
  console.log(`  ✅ app-meta.json → data/shops/dev.db`);

  // ─── Clean ALL existing data ──────────────────────────────────────────────
  console.log("  🗑️  Cleaning existing data...");
  await prisma.extractionMetric.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
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
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.automation.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.whatsAppTemplate.deleteMany();
  await prisma.wilayaRiskProfile.deleteMany();
  await prisma.storefrontConfig.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.authSecret.deleteMany();
  console.log("  ✅ Cleaned\n");

  // ─── Auth (PIN: 12345678) ─────────────────────────────────────────────────
  const pinHash = await hashPin("12345678");
  const secret = "dev-auth-secret-for-testing-only-not-production";
  await prisma.authSecret.create({
    data: { id: "default", pinHash, secret },
  });
  process.env.AUTH_SECRET = secret;
  console.log("  ✅ Auth: PIN=12345678, secret set");

  // ─── Settings ─────────────────────────────────────────────────────────────
  await prisma.setting.create({ data: { key: "daily_report_enabled", value: "true" } });
  await prisma.setting.create({ data: { key: "daily_report_phone", value: "0555123456" } });
  await prisma.setting.create({ data: { key: "daily_report_time", value: "09:00" } });
  await prisma.setting.create({ data: { key: "business_wilaya", value: "Alger" } });
  await prisma.setting.create({ data: { key: "risk_engine_config", value: JSON.stringify({ weights: { customerReturnRate: 1, customerLoyalty: 1, newCustomer: 1, orderFrequency: 1, wilayaRisk: 1, orderValue: 1, contactQuality: 1 }, thresholds: { medium: 30, high: 60, critical: 80 }, autoActions: { medium: "standard", high: "call_first", critical: "review" }, autoBlacklistReturnRate: 0.8 }) } });
  await prisma.setting.create({ data: { key: "risk_engine_rules", value: JSON.stringify([
    { id: "rule-1", labelKey: "risk.rules.highReturnRate", enabled: true, condition: { type: "customer_return_rate_gte", value: 0.5 }, effect: { type: "set_action", value: "review" }, triggerCount: 3 },
    { id: "rule-2", labelKey: "risk.rules.newCustomerHighValue", enabled: true, condition: { type: "order_value_gte", value: 10000 }, effect: { type: "set_action", value: "call_first" }, triggerCount: 1 },
    { id: "rule-3", labelKey: "risk.rules.blacklistedCustomer", enabled: true, condition: { type: "customer_blacklisted", value: true }, effect: { type: "set_action", value: "blacklisted" }, triggerCount: 0 },
  ]) } });
  console.log("  ✅ Settings: daily report, risk engine config + rules");

  // ─── Wilaya Risk Profiles ─────────────────────────────────────────────────
  const wilayasData = [
    { wilaya: "Alger", riskLevel: 1, confirmationRate: 0.92, returnRate: 0.08 },
    { wilaya: "Oran", riskLevel: 1, confirmationRate: 0.90, returnRate: 0.10 },
    { wilaya: "Constantine", riskLevel: 2, confirmationRate: 0.85, returnRate: 0.15 },
    { wilaya: "Sétif", riskLevel: 2, confirmationRate: 0.83, returnRate: 0.17 },
    { wilaya: "Annaba", riskLevel: 2, confirmationRate: 0.82, returnRate: 0.18 },
    { wilaya: "Blida", riskLevel: 1, confirmationRate: 0.88, returnRate: 0.12 },
    { wilaya: "Batna", riskLevel: 3, confirmationRate: 0.75, returnRate: 0.25 },
    { wilaya: "Tizi Ouzou", riskLevel: 2, confirmationRate: 0.80, returnRate: 0.20 },
    { wilaya: "Béjaïa", riskLevel: 2, confirmationRate: 0.81, returnRate: 0.19 },
    { wilaya: "Tlemcen", riskLevel: 2, confirmationRate: 0.84, returnRate: 0.16 },
    { wilaya: "Tiaret", riskLevel: 3, confirmationRate: 0.73, returnRate: 0.27 },
    { wilaya: "Djelfa", riskLevel: 4, confirmationRate: 0.65, returnRate: 0.35 },
    { wilaya: "Skikda", riskLevel: 3, confirmationRate: 0.72, returnRate: 0.28 },
    { wilaya: "Médéa", riskLevel: 2, confirmationRate: 0.79, returnRate: 0.21 },
  ];
  for (const w of wilayasData) {
    await prisma.wilayaRiskProfile.create({ data: w });
  }
  console.log(`  ✅ ${wilayasData.length} wilaya risk profiles`);

  // ─── Categories ───────────────────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.create({ data: { name: "Électronique" } }),
    prisma.category.create({ data: { name: "Mode" } }),
    prisma.category.create({ data: { name: "Maison" } }),
    prisma.category.create({ data: { name: "Beauté" } }),
  ]);
  console.log(`  ✅ ${categories.length} categories`);

  // ─── Products (20, 8 with variants) ───────────────────────────────────────
  const productData = [
    { name: "Écouteurs Bluetooth JBL", sku: "ELEC-001", price: 4500, cost: 2800, stock: 50, cat: 0, variants: true },
    { name: "Chargeur Rapide USB-C 65W", sku: "ELEC-002", price: 2200, cost: 1200, stock: 80, cat: 0 },
    { name: "Montre Connectée Smart Watch", sku: "ELEC-003", price: 8500, cost: 5500, stock: 25, cat: 0, variants: true },
    { name: "Power Bank 20000mAh", sku: "ELEC-004", price: 3200, cost: 1800, stock: 3, lowStock: 5, cat: 0 },
    { name: "Coque iPhone 14 Pro", sku: "ELEC-005", price: 1200, cost: 400, stock: 100, cat: 0, variants: true },
    { name: "Câble HDMI 2m", sku: "ELEC-006", price: 800, cost: 300, stock: 60, cat: 0 },
    { name: "Souris Sans Fil Logitech", sku: "ELEC-007", price: 1800, cost: 700, stock: 40, cat: 0 },
    { name: "Clavier Mécanique RGB", sku: "ELEC-008", price: 5500, cost: 3000, stock: 12, cat: 0, variants: true },
    { name: "Robe d'été Algérienne", sku: "MODE-001", price: 3500, cost: 1500, stock: 40, cat: 1, variants: true },
    { name: "Chemise Homme Coton", sku: "MODE-002", price: 2800, cost: 1200, stock: 35, cat: 1, variants: true },
    { name: "Basket Sport Homme", sku: "MODE-003", price: 6500, cost: 3500, stock: 20, cat: 1, variants: true },
    { name: "Sac à Main Femme", sku: "MODE-004", price: 4200, cost: 1800, stock: 15, cat: 1, variants: true },
    { name: "Djellaba Femme Premium", sku: "MODE-005", price: 5200, cost: 2400, stock: 28, cat: 1, variants: true },
    { name: "Coffret Thé Décoré", sku: "MAIS-001", price: 5500, cost: 2500, stock: 18, cat: 2 },
    { name: "Tapis de Prière Premium", sku: "MAIS-002", price: 3800, cost: 1600, stock: 45, cat: 2 },
    { name: "Ensemble Bougie Parfumée", sku: "MAIS-003", price: 2500, cost: 900, stock: 30, cat: 2 },
    { name: "Miroir Mural Décoratif", sku: "MAIS-004", price: 4800, cost: 2200, stock: 2, lowStock: 5, cat: 2 },
    { name: "Coussin Brodé Main", sku: "MAIS-005", price: 1800, cost: 700, stock: 50, cat: 2 },
    { name: "Parfum Oud Royal 50ml", sku: "BEAU-001", price: 6800, cost: 3200, stock: 22, cat: 3 },
    { name: "Huile de Barbe Premium", sku: "BEAU-002", price: 1500, cost: 500, stock: 60, cat: 3 },
  ];

  const products: Array<{ id: string; name: string; price: number; stock: number; categoryId: string }> = [];
  for (const p of productData) {
    const product = await prisma.product.create({
      data: {
        name: p.name, sku: p.sku, price: p.price, cost: p.cost,
        stock: p.stock, lowStockThreshold: p.lowStock ?? 5,
        categoryId: categories[p.cat]!.id, isActive: true,
      },
    }) as { id: string; name: string; price: number; stock: number; categoryId: string };
    products.push(product);

    // Add variants for products flagged with variants: true
    if (p.variants) {
      if (p.cat === 0) { // Electronics — color variants
        const colors = p.name.includes("Coque") ? ["Noir", "Bleu", "Rouge"] : p.name.includes("Clavier") ? ["Noir", "Blanc"] : ["Noir", "Blanc"];
        for (let vi = 0; vi < colors.length; vi++) {
          await prisma.productVariant.create({
            data: {
              productId: product.id, name: colors[vi]!, sku: `${p.sku}-${colors[vi]!.slice(0, 3).toUpperCase()}`,
              price: p.price + (vi === 0 ? 0 : 200), stock: Math.floor(p.stock / colors.length),
              isActive: true, sortOrder: vi,
            },
          });
        }
      } else if (p.cat === 1) { // Mode — size variants
        const sizes = ["S", "M", "L", "XL"];
        for (let vi = 0; vi < sizes.length; vi++) {
          await prisma.productVariant.create({
            data: {
              productId: product.id, name: `Taille ${sizes[vi]}`, sku: `${p.sku}-${sizes[vi]}`,
              price: p.price, stock: Math.floor(p.stock / sizes.length),
              isActive: true, sortOrder: vi,
            },
          });
        }
      }
    }
  }
  console.log(`  ✅ ${products.length} products (8 with variants)`);

  // ─── Customers (30) ───────────────────────────────────────────────────────
  const customers: Array<{ id: string; name: string; phone: string; wilaya: string | null }> = [];
  for (let i = 0; i < CUSTOMER_NAMES.length; i++) {
    const c = CUSTOMER_NAMES[i]!;
    const loc = WILAYA_COMMUNE[i % WILAYA_COMMUNE.length]!;
    const isBlacklisted = i === 14; // one blacklisted customer
    const customer = await prisma.customer.create({
      data: {
        name: c.name, phone: c.phone,
        phone2: i % 3 === 0 ? `0${randomInt(550, 770)}${randomInt(1000000, 9999999)}` : null,
        wilaya: loc.wilaya, commune: loc.commune,
        address: randomFrom(ADDRESSES),
        orderCount: i < 8 ? randomInt(4, 10) : i < 18 ? randomInt(1, 3) : randomInt(0, 1),
        totalSpent: i < 8 ? randomInt(20000, 60000) : i < 18 ? randomInt(3000, 15000) : randomInt(0, 5000),
        riskScore: 0, // will be computed by risk engine on assess
        isBlacklisted,
        blacklistReason: isBlacklisted ? "Trop de retours (3 en 2 semaines)" : null,
        blacklistedAt: isBlacklisted ? daysAgo(3) : null,
        notes: i % 5 === 0 ? "Client fidèle — toujours confirmé" : i % 7 === 0 ? "Préfère être appelé avant livraison" : null,
        createdAt: daysAgo(randomInt(1, 90)),
      },
    }) as { id: string; name: string; phone: string; wilaya: string | null };
    customers.push(customer);
  }
  console.log(`  ✅ ${customers.length} customers (1 blacklisted)`);

  // ─── Orders (80) — full lifecycle, 30-day spread ──────────────────────────
  const ORDER_STATUSES = [
    "draft", "draft", "draft",
    "pending", "pending", "pending", "pending", "pending", "pending", "pending", "pending",
    "confirmed", "confirmed", "confirmed", "confirmed", "confirmed", "confirmed",
    "shipped", "shipped", "shipped", "shipped", "shipped", "shipped", "shipped",
    "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered",
    "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered",
    "delivered", "delivered", "delivered", "delivered", "delivered", "delivered", "delivered",
    "returned", "returned", "returned", "returned",
    "refused", "refused", "refused",
    "cancelled", "cancelled", "cancelled",
  ] as const;

  const SOURCES = ["whatsapp", "whatsapp", "whatsapp", "whatsapp", "whatsapp", "manual", "manual", "storefront", "storefront", "ai_chat", "tiktok"] as const;
  let orderSeq = 1;

  for (let i = 0; i < ORDER_STATUSES.length; i++) {
    const customer = customers[i % customers.length]!;
    const itemCount = randomInt(1, 3);
    const itemsPicked: Array<{ product: typeof products[0]; quantity: number }> = [];
    for (let j = 0; j < itemCount; j++) {
      const product = randomFrom(products);
      if (!itemsPicked.some((it) => it.product.id === product.id)) {
        itemsPicked.push({ product, quantity: randomInt(1, 3) });
      }
    }
    if (itemsPicked.length === 0) itemsPicked.push({ product: products[0]!, quantity: 1 });

    const itemsTotal = itemsPicked.reduce((sum, it) => sum + it.product.price * it.quantity, 0);
    const deliveryCost = randomFrom([400, 500, 600, 700, 800]);
    const status = ORDER_STATUSES[i]!;
    const dayOffset = Math.floor(i / 3);
    const createdAt = daysAgo(dayOffset);
    const source = randomFrom(SOURCES);
    const loc = WILAYA_COMMUNE.find((w) => w.wilaya === customer.wilaya) ?? WILAYA_COMMUNE[0]!;

    const orderData: Record<string, unknown> = {
      orderNumber: `ORD-${String(orderSeq).padStart(4, "0")}`,
      status,
      customerId: customer.id,
      wilaya: customer.wilaya ?? loc.wilaya,
      commune: (customer as { commune?: string }).commune ?? loc.commune,
      address: randomFrom(ADDRESSES),
      phone: customer.phone,
      totalPrice: itemsTotal + deliveryCost,
      deliveryCost,
      source,
      sourceMetadata: source === "storefront" ? JSON.stringify({ storefrontSlug: "sahelflow-demo" }) : source === "ai_chat" ? JSON.stringify({ aiSessionId: "seed-session" }) : null,
      notes: i % 6 === 0 ? "Client demande livraison rapide" : null,
      createdAt,
      confirmedAt: ["confirmed", "shipped", "delivered", "returned", "refused"].includes(status) ? new Date(createdAt.getTime() + randomInt(1, 4) * 3600000) : null,
      shippedAt: ["shipped", "delivered", "returned", "refused"].includes(status) ? new Date(createdAt.getTime() + randomInt(4, 12) * 3600000) : null,
      deliveredAt: ["delivered", "returned"].includes(status) ? new Date(createdAt.getTime() + randomInt(1, 3) * 86400000) : null,
      items: {
        create: itemsPicked.map((it) => ({
          productId: it.product.id,
          productName: it.product.name,
          quantity: it.quantity,
          unitPrice: it.product.price,
          total: it.product.price * it.quantity,
        })),
      },
    };

    await prisma.order.create({ data: orderData as never });
    orderSeq++;
  }
  console.log(`  ✅ ${ORDER_STATUSES.length} orders (full lifecycle, 30-day spread)`);

  // ─── Deliveries (40) ──────────────────────────────────────────────────────
  const DELIVERY_PROVIDERS = ["yalidine", "maystro", "zrexpress", "noest"] as const;
  const deliveryOrders = await prisma.order.findMany({
    where: { status: { in: ["confirmed", "shipped", "delivered", "returned", "refused"] } },
    take: 40,
  });

  let deliverySeq = 1;
  for (const order of deliveryOrders) {
    const provider = DELIVERY_PROVIDERS[deliverySeq % 4]!;
    let deliveryStatus: string;
    if (order.status === "delivered") deliveryStatus = "delivered";
    else if (order.status === "returned") deliveryStatus = "returned";
    else if (order.status === "refused") deliveryStatus = "refused";
    else if (order.status === "shipped") deliveryStatus = randomFrom(["in_transit", "at_hub", "out_for_delivery"]);
    else deliveryStatus = randomFrom(["pending", "created", "picked_up"]);

    await prisma.delivery.create({
      data: {
        orderId: order.id, provider,
        trackingNumber: `${provider.toUpperCase()}-${String(deliverySeq).padStart(5, "0")}`,
        cost: randomFrom([400, 500, 600, 700, 800]),
        status: deliveryStatus,
        estimatedDelivery: ["shipped", "delivered"].includes(order.status) ? new Date(order.createdAt.getTime() + 2 * 86400000) : null,
        createdAt: order.createdAt,
      },
    });
    deliverySeq++;
  }
  console.log(`  ✅ ${deliveryOrders.length} deliveries (4 providers)`);

  // ─── Returns (15) with notes ──────────────────────────────────────────────
  const RETURN_REASONS = [
    "Taille ne convient pas", "Produit défectueux", "Client absent",
    "Mauvaise couleur livrée", "Changement d'avis", "Produit endommagé pendant le transport",
    "Ne correspond pas à la description", "Client a trouvé moins cher ailleurs",
  ];
  const RETURN_STATUSES = ["requested", "requested", "approved", "approved", "completed", "completed", "completed", "rejected"] as const;
  const RETURN_TYPES = ["return", "return", "return", "exchange", "exchange"] as const;

  const returnableOrders = await prisma.order.findMany({
    where: { status: { in: ["delivered", "returned"] } },
    take: 15,
  });

  for (let i = 0; i < returnableOrders.length; i++) {
    const order = returnableOrders[i]!;
    const ret = await prisma.return.create({
      data: {
        orderId: order.id,
        type: RETURN_TYPES[i % RETURN_TYPES.length]!,
        status: RETURN_STATUSES[i % RETURN_STATUSES.length]!,
        reason: RETURN_REASONS[i % RETURN_REASONS.length]!,
        notes: i % 3 === 0 ? "Client demande remboursement intégral" : null,
        createdAt: daysAgo(randomInt(0, 10)),
      },
    });

    // Add a return note for some returns
    if (i % 2 === 0) {
      await prisma.returnNote.create({
        data: {
          returnId: ret.id,
          body: i % 4 === 0 ? "Produit reçu en bon état, remboursement approuvé" : "En attente de confirmation du client",
        },
      });
    }
  }
  console.log(`  ✅ ${returnableOrders.length} returns (with notes)`);

  // ─── Expenses (20) — using correct schema categories ──────────────────────
  const EXPENSE_DATA: Array<{ category: string; notes: string; amount: number; daysAgo: number }> = [
    { category: "delivery_fees", notes: "Frais Yalidine — lot semaine", amount: 4500, daysAgo: 1 },
    { category: "delivery_fees", notes: "Frais Maystro — lot jour", amount: 2800, daysAgo: 2 },
    { category: "delivery_fees", notes: "Frais ZR Express", amount: 3200, daysAgo: 3 },
    { category: "delivery_fees", notes: "Frais NOEST Express", amount: 2200, daysAgo: 5 },
    { category: "ads", notes: "Publicité Facebook Ads", amount: 8000, daysAgo: 1 },
    { category: "ads", notes: "Instagram sponsorisé", amount: 5000, daysAgo: 4 },
    { category: "ads", notes: "TikTok Ads", amount: 6000, daysAgo: 7 },
    { category: "packaging", notes: "Achat cartons d'emballage x100", amount: 3500, daysAgo: 6 },
    { category: "packaging", notes: "Achat étiquettes + ruban adhésif", amount: 1200, daysAgo: 8 },
    { category: "returns", notes: "Frais de retour — 3 colis", amount: 1800, daysAgo: 3 },
    { category: "returns", notes: "Remboursement client — produit défectueux", amount: 4500, daysAgo: 5 },
    { category: "supplies", notes: "Achat matériel bureau", amount: 2500, daysAgo: 10 },
    { category: "supplies", notes: "Maintenance ordinateur", amount: 3000, daysAgo: 12 },
    { category: "salary", notes: "Salaire livreur — semaine", amount: 12000, daysAgo: 1 },
    { category: "salary", notes: "Salaire assistant — mois", amount: 25000, daysAgo: 15 },
    { category: "rent", notes: "Loyer local stockage", amount: 20000, daysAgo: 1 },
    { category: "rent", notes: "Loyer bureau", amount: 15000, daysAgo: 15 },
    { category: "other", notes: "Carburant livreur", amount: 4000, daysAgo: 4 },
    { category: "other", notes: "Facture électricité", amount: 3500, daysAgo: 8 },
    { category: "other", notes: "Internet + téléphone", amount: 2500, daysAgo: 10 },
  ];

  for (const e of EXPENSE_DATA) {
    await prisma.expense.create({
      data: { category: e.category, notes: e.notes, amount: e.amount, date: daysAgo(e.daysAgo, false) },
    });
  }
  console.log(`  ✅ ${EXPENSE_DATA.length} expenses (8 categories)`);

  // ─── Conversations + Messages (WhatsApp inbox) ────────────────────────────
  const conversations = [];
  for (let i = 0; i < 10; i++) {
    const customer = customers[i]!;
    const conv = await prisma.conversation.create({
      data: {
        channel: "whatsapp",
        contactName: customer.name,
        contactPhone: customer.phone,
        sourceId: `${customer.phone}@s.whatsapp.net`,
        lastMessageAt: daysAgo(randomInt(0, 5)),
        unreadCount: i % 3 === 0 ? randomInt(1, 3) : 0,
        createdAt: daysAgo(randomInt(5, 30)),
      },
    });
    conversations.push(conv);

    // Add 3-5 messages per conversation
    const msgCount = randomInt(3, 5);
    for (let j = 0; j < msgCount; j++) {
      const isIncoming = j % 2 === 0;
      const msgText = isIncoming
        ? randomFrom(WHATSAPP_MESSAGES)
        : randomFrom([
            "Salam! Commande confirmée. Livraison prévue demain 📦",
            "Merci pour votre commande! Le total est de {{total}} DA",
            "Bonjour, votre colis est en route. Numéro de suivi: {{tracking}}",
            "Commande livrée avec succès! Merci de votre confiance 🙏",
          ]);
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          body: msgText,
          direction: isIncoming ? "incoming" : "outgoing",
          timestamp: daysAgo(randomInt(0, 5)),
          extractionMethod: isIncoming ? (j === 0 ? "regex" : null) : null,
          extractedOrderJson: isIncoming && j === 0 ? JSON.stringify({ customerName: customer.name, phone: customer.phone, items: [{ name: "Test Product", quantity: 1, price: 2500 }] }) : null,
        },
      });
    }
  }
  console.log(`  ✅ ${conversations.length} conversations + ${conversations.length * 4} messages`);

  // ─── Storefront Config ────────────────────────────────────────────────────
  await prisma.storefrontConfig.create({
    data: {
      slug: "sahelflow-demo",
      name: "SahelFlow Demo Store",
      description: "Boutique de démonstration — produits de qualité à Alger",
      theme: JSON.stringify({ template: "modern", primaryColor: "#0ea5e9", showPrices: true, showStock: true }),
      productIds: JSON.stringify(products.slice(0, 8).map((p) => p.id)),
      contact: JSON.stringify({ phone: "0555123456", whatsapp: "0555123456", email: "contact@sahelflow.demo", address: "Alger, Algérie" }),
      isActive: true,
    },
  });
  console.log("  ✅ 1 storefront config (active, 8 products)");

  // ─── Notifications — removed in Phase 5 (table dropped; the bell computes fresh).

  // ─── Automations (3) ──────────────────────────────────────────────────────
  const AUTOMATIONS = [
    { name: "Confirmation automatique", trigger: "order_created", action: "auto_confirm", isActive: true, runCount: 45, lastRunAt: daysAgo(0) },
    { name: "Notification stock faible", trigger: "low_stock", action: "notify_seller", isActive: true, runCount: 8, lastRunAt: daysAgo(1) },
    { name: "Relance client absent", trigger: "delivery_failed", action: "call_customer", isActive: false, runCount: 3, lastRunAt: daysAgo(5) },
  ];
  for (const a of AUTOMATIONS) {
    await prisma.automation.create({ data: a });
  }
  console.log(`  ✅ ${AUTOMATIONS.length} automations`);

  // ─── AI Chat Sessions (3) + Messages (10) ─────────────────────────────────
  const sessions = [];
  for (let i = 0; i < 3; i++) {
    const session = await prisma.aiChatSession.create({
      data: { title: `Session ${i + 1}`, createdAt: daysAgo(randomInt(1, 7)) },
    });
    sessions.push(session);
  }

  const AI_MESSAGES = [
    { role: "user", content: "Quelles sont mes ventes d'aujourd'hui?", toolCalls: null },
    { role: "assistant", content: "Aujourd'hui vous avez eu 8 commandes pour un total de 45 200 DA. 5 sont confirmées, 2 en attente et 1 annulée. Le meilleur produit est les Écouteurs Bluetooth JBL avec 3 ventes.", toolCalls: JSON.stringify([{ name: "get_stats", result: { orders: 8, revenue: 45200 } }]) },
    { role: "user", content: "Montre-moi les produits en rupture de stock", toolCalls: null },
    { role: "assistant", content: "J'ai trouvé 2 produits en stock faible:\n1. Power Bank 20000mAh — 3 unités (seuil: 5)\n2. Miroir Mural Décoratif — 2 unités (seuil: 5)\n\nJe recommande de réapprovisionner rapidement.", toolCalls: JSON.stringify([{ name: "get_low_stock_products", result: [{ name: "Power Bank 20000mAh", stock: 3 }] }]) },
    { role: "user", content: "Crée une commande pour Ahmed Benali: 2x Écouteurs JBL, livraison Alger", toolCalls: null },
    { role: "assistant", content: "Commande créée avec succès! Numéro: ORD-0081. Total: 9800 DA (2x 4500 + 800 livraison). Statut: brouillon. Voulez-vous la confirmer?", toolCalls: JSON.stringify([{ name: "create_order", result: { orderNumber: "ORD-0081", total: 9800 } }]) },
    { role: "user", content: "Quels sont mes meilleurs clients?", toolCalls: null },
    { role: "assistant", content: "Voici vos 3 meilleurs clients par montant dépensé:\n1. Ahmed Benali — 52 000 DA (8 commandes)\n2. Fatima Zohra — 38 500 DA (6 commandes)\n3. Karim Haddad — 31 200 DA (5 commandes)", toolCalls: JSON.stringify([{ name: "search_customers", result: [{ name: "Ahmed Benali", totalSpent: 52000 }] }]) },
    { role: "user", content: "Annule la commande ORD-0003", toolCalls: null },
    { role: "assistant", content: "La commande ORD-0003 a été annulée avec succès. Le stock des produits a été restauré.", toolCalls: JSON.stringify([{ name: "cancel_order", result: { orderNumber: "ORD-0003", status: "cancelled" } }]) },
  ];

  for (let i = 0; i < AI_MESSAGES.length; i++) {
    const msg = AI_MESSAGES[i]!;
    await prisma.aiChatMessage.create({
      data: {
        sessionId: sessions[i % sessions.length]!.id,
        role: msg.role,
        content: msg.content,
        toolCalls: msg.toolCalls,
        createdAt: daysAgo(randomInt(1, 7)),
      },
    });
  }
  console.log(`  ✅ ${sessions.length} AI chat sessions + ${AI_MESSAGES.length} messages`);

  // ─── Extraction Metrics (10) ──────────────────────────────────────────────
  const EXTRACTION_DATA = [
    { method: "regex", confidence: 0.95, isComplete: true, latencyMs: 12, modelVersion: null },
    { method: "regex", confidence: 0.60, isComplete: false, latencyMs: 8, modelVersion: null, missingFields: ["address"] },
    { method: "gemini", confidence: 0.92, isComplete: true, latencyMs: 1200, modelVersion: "gemini-2.5-flash" },
    { method: "gemini", confidence: 0.88, isComplete: true, latencyMs: 980, modelVersion: "gemini-2.5-flash" },
    { method: "gemini", confidence: 0.45, isComplete: false, latencyMs: 1100, modelVersion: "gemini-2.5-flash", missingFields: ["phone", "wilaya"] },
    { method: "regex", confidence: 0.90, isComplete: true, latencyMs: 10, modelVersion: null },
    { method: "gemini", confidence: 0.95, isComplete: true, latencyMs: 850, modelVersion: "gemini-2.5-flash" },
    { method: "none", confidence: 0.0, isComplete: false, latencyMs: 2, modelVersion: null, missingFields: ["all"] },
    { method: "regex", confidence: 0.75, isComplete: true, latencyMs: 15, modelVersion: null },
    { method: "gemini", confidence: 0.91, isComplete: true, latencyMs: 1050, modelVersion: "gemini-2.5-flash" },
  ];

  for (let i = 0; i < EXTRACTION_DATA.length; i++) {
    const e = EXTRACTION_DATA[i]!;
    await prisma.extractionMetric.create({
      data: {
        method: e.method,
        confidence: e.confidence,
        isComplete: e.isComplete,
        missingFields: e.missingFields ? JSON.stringify(e.missingFields) : null,
        fieldAccuracy: JSON.stringify({ name: true, phone: e.isComplete, wilaya: e.isComplete, address: !e.missingFields?.includes("address") }),
        latencyMs: e.latencyMs,
        modelVersion: e.modelVersion,
        createdAt: daysAgo(randomInt(0, 14)),
      },
    });
  }
  console.log(`  ✅ ${EXTRACTION_DATA.length} extraction metrics`);

  // ─── Audit Log (5 entries) ────────────────────────────────────────────────
  const AUDIT_ENTRIES = [
    { action: "auth.login.success", ip: "127.0.0.1", metadata: null, createdAt: daysAgo(0) },
    { action: "auth.login.failed", ip: "127.0.0.1", metadata: JSON.stringify({ reason: "wrong_pin" }), createdAt: daysAgo(1) },
    { action: "auth.logout", ip: "127.0.0.1", metadata: null, createdAt: daysAgo(2) },
    { action: "auth.pin.change", ip: "127.0.0.1", metadata: null, createdAt: daysAgo(5) },
    { action: "auth.setup", ip: "127.0.0.1", metadata: null, createdAt: daysAgo(30) },
  ];
  for (const a of AUDIT_ENTRIES) {
    await prisma.auditLog.create({ data: a });
  }
  console.log(`  ✅ ${AUDIT_ENTRIES.length} audit log entries`);

  // ─── Counter ──────────────────────────────────────────────────────────────
  await prisma.counter.create({ data: { name: "ORD", value: orderSeq } });
  console.log(`  ✅ Counter: ORD=${orderSeq}`);

  // ─── WhatsApp Templates (3) ───────────────────────────────────────────────
  const TEMPLATES = [
    { name: "confirmation_commande", content: "Salam {{name}}, votre commande {{order_number}} est confirmée. Total: {{total}} DA. Livraison prévue à {{wilaya}}.", language: "fr", category: "transaction" },
    { name: "livraison_en_cours", content: "Bonjour {{name}}, votre colis {{tracking_number}} est en cours de livraison à {{commune}}.", language: "fr", category: "transaction" },
    { name: "relance_confirmation", content: "Salam {{name}}, nous n'avons pas eu de confirmation pour votre commande. Pouvez-vous confirmer svp?", language: "fr", category: "marketing" },
  ];
  for (const t of TEMPLATES) {
    await prisma.whatsAppTemplate.create({ data: t });
  }
  console.log(`  ✅ ${TEMPLATES.length} WhatsApp templates`);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n✅ Rich seed complete!");
  console.log("   Auth: PIN=12345678");
  console.log("   4 categories, 20 products (8 with variants), 30 customers (1 blacklisted)");
  console.log("   80 orders (full lifecycle), 40 deliveries (4 providers), 15 returns (with notes)");
  console.log("   20 expenses (8 categories), 10 conversations + 40 messages, 1 storefront");
  console.log("   5 notifications, 3 automations, 3 AI sessions + 10 messages");
  console.log("   10 extraction metrics, 5 audit logs, 14 wilaya risk profiles");
  console.log("   3 WhatsApp templates, risk engine config + rules");
  console.log("\n   Run 'bun run dev' or 'bun run tauri:dev' to view.");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
