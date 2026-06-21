import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const submitSchema = z.object({
  slug: z.string().min(1),
  customer: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().min(1).max(20),
    wilaya: z.string().min(1),
    commune: z.string().min(1),
    address: z.string().min(1).max(500),
  }),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().min(1).max(99),
  })).min(1),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/storefront/submit — public order placement from a storefront.
 *
 * Creates a customer (or finds by phone) + creates a draft order with
 * source="storefront". The seller sees it in their orders list + dashboard.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = submitSchema.parse(body);

    // Verify the storefront exists + is active
    const { storefrontService } = await import("@/lib/storefront/service");
    const config = await storefrontService.getBySlug(input.slug);
    if (!config || !config.isActive) {
      return NextResponse.json({ error: "Storefront introuvable ou inactif" }, { status: 404 });
    }

    // Fetch the products (validate they're in the storefront + get prices)
    const products = await db.product.findMany({
      where: {
        id: { in: input.items.map((i) => i.productId) },
        isActive: true,
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate all items are in the storefront's product list
    for (const item of input.items) {
      if (!config.productIds.includes(item.productId)) {
        return NextResponse.json(
          { error: `Produit non disponible dans cette boutique` },
          { status: 400 },
        );
      }
      if (!productMap.has(item.productId)) {
        return NextResponse.json({ error: "Produit introuvable" }, { status: 400 });
      }
    }

    // Find or create the customer
    let customer = await db.customer.findUnique({
      where: { phone: input.customer.phone },
    });
    if (!customer) {
      customer = await db.customer.create({
        data: {
          name: input.customer.name,
          phone: input.customer.phone,
          wilaya: input.customer.wilaya,
          commune: input.customer.commune,
          address: input.customer.address,
        },
      });
    }

    // Build order items
    const orderItems = input.items.map((item) => {
      const product = productMap.get(item.productId)!;
      return {
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: product.price,
        total: product.price * item.quantity,
      };
    });

    const total = orderItems.reduce((sum, i) => sum + i.total, 0);

    // Generate order number
    const orderCount = await db.order.count();
    const orderNumber = `ORD-${String(orderCount + 1).padStart(4, "0")}`;

    // Create the order
    const order = await db.order.create({
      data: {
        orderNumber,
        customerId: customer.id,
        status: "draft",
        items: { create: orderItems },
        totalPrice: total,
        wilaya: input.customer.wilaya,
        commune: input.customer.commune,
        address: input.customer.address,
        phone: input.customer.phone,
        source: "storefront",
        sourceMetadata: JSON.stringify({ storefrontSlug: input.slug }),
        notes: input.notes,
      },
      include: { items: true },
    });

    return NextResponse.json({
      ok: true,
      orderNumber: order.orderNumber,
      orderId: order.id,
      total: order.totalPrice,
      message: "Commande passée avec succès ! Le vendeur vous contactera bientôt.",
    }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Données invalides", details: err.issues }, { status: 400 });
    }
    console.error("[POST /api/storefront/submit]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur lors de la commande" },
      { status: 500 },
    );
  }
}
