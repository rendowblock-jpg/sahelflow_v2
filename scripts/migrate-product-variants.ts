/**
 * Migration script — convert Product.variants (JSON string) to ProductVariant rows.
 *
 * For each Product:
 *   - If variants JSON exists and is an array of variant objects → create ProductVariant rows
 *   - If variants JSON is missing/null/empty → create a single "Default" variant with the product's stock
 *   - Each variant gets: name, sku (if provided), price (if provided), stock (if provided, else 0)
 *
 * Run after `bun run db:push` (which creates the ProductVariant table).
 *
 * Usage: bun --conditions react-server scripts/migrate-product-variants.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["warn", "error"] });

interface LegacyVariant {
  name?: string;
  size?: string;
  color?: string;
  sku?: string;
  price?: number;
  stock?: number;
}

async function main() {
  console.log("🔄 Migrating Product.variants JSON → ProductVariant rows...");

  const products = await prisma.product.findMany();
  console.log(`  Found ${products.length} products to migrate`);

  let migrated = 0;
  let defaultsCreated = 0;

  for (const product of products) {
    // Check if variants already exist for this product (idempotent)
    const existing = await prisma.productVariant.count({ where: { productId: product.id } });
    if (existing > 0) {
      console.log(`  ⏭️  ${product.name}: already has ${existing} variants, skipping`);
      continue;
    }

    let variants: LegacyVariant[] = [];
    if (product.variants) {
      try {
        const parsed = JSON.parse(product.variants);
        if (Array.isArray(parsed)) {
          variants = parsed;
        }
      } catch {
        // not JSON, skip
      }
    }

    if (variants.length === 0) {
      // Create a default variant with the product's stock
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: "Default",
          sku: product.sku,
          price: product.price,
          stock: product.stock,
          isActive: true,
          sortOrder: 0,
        },
      });
      defaultsCreated++;
    } else {
      // Create a variant row for each legacy variant
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i]!;
        const name = v.name || [v.size, v.color].filter(Boolean).join(" - ") || `Variant ${i + 1}`;
        await prisma.productVariant.create({
          data: {
            productId: product.id,
            name,
            sku: v.sku,
            price: v.price,
            stock: v.stock ?? 0,
            isActive: true,
            sortOrder: i,
          },
        });
      }
      migrated++;
    }
  }

  console.log(`\n✅ Migration complete!`);
  console.log(`   ${migrated} products had explicit variants → migrated to rows`);
  console.log(`   ${defaultsCreated} products had no variants → created "Default" variant`);
  console.log(`\nNext steps:`);
  console.log(`   - Verify with: sf-db query "SELECT COUNT(*) FROM ProductVariant"`);
  console.log(`   - The Product.variants JSON column is kept for backward compat but no longer used`);
}

main()
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
