import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rateLimit, rateLimitHeaders, getClientIP } from "@/lib/rate-limit";

const schema = z.object({
  sellerSlug: z.string().min(1),
  customer: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().regex(/^(05|06|07)[0-9]{8}$/),
    wilaya: z.string().min(1).max(50).optional(),
    commune: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
  }),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        name: z.string(),
        quantity: z.number().int().min(1),
        price: z.number().min(0),
      }),
    )
    .min(1),
  notes: z.string().max(1000).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: Request) {
  const ip = getClientIP(req); // S13 fix: spoofing-resistant IP
  const limit = rateLimit(`form:${ip}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: { ...rateLimitHeaders(limit), "Retry-After": "60" },
      },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { sellerSlug, customer, items, notes, customFields } = parsed.data;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Find seller
  const { data: seller, error: sellerError } = await supabase
    .from("sellers")
    .select("id, form_enabled")
    .eq("slug", sellerSlug)
    .single();

  if (sellerError || !seller) {
    return NextResponse.json({ error: "Seller not found" }, { status: 404 });
  }

  if (!seller.form_enabled) {
    return NextResponse.json(
      { error: "Order form is disabled" },
      { status: 403 },
    );
  }

  // Verify products exist and belong to seller
  const productIds = items.map((i) => i.product_id);
  const { data: products, error: prodError } = await supabase
    .from("products")
    .select("id, stock, price")
    .eq("seller_id", seller.id)
    .in("id", productIds);

  if (prodError || !products || products.length !== productIds.length) {
    return NextResponse.json(
      { error: "One or more products not found" },
      { status: 400 },
    );
  }

  // Check stock
  for (const item of items) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product || product.stock < item.quantity) {
      return NextResponse.json(
        { error: `Insufficient stock for ${item.name}` },
        { status: 400 },
      );
    }
  }

  // Atomically upsert customer — eliminates the SELECT-then-INSERT race condition
  const { data: customerData, error: custErr } = await supabase
    .from("customers")
    .upsert(
      {
        seller_id: seller.id,
        name: customer.name,
        phone: customer.phone,
        wilaya: customer.wilaya || null,
        commune: customer.commune || null,
        address: customer.address || null,
        metadata: { source: "public_form" },
      },
      { onConflict: "seller_id,phone" },
    )
    .select("id")
    .single();

  if (custErr || !customerData) {
    return NextResponse.json(
      { error: "Failed to create customer" },
      { status: 500 },
    );
  }
  const customerId = customerData.id;

  // Calculate totals using server-side prices — never trust client-supplied prices
  const orderItems = items.map((i) => {
    const dbProduct = products.find((p) => p.id === i.product_id);
    const actualPrice = dbProduct?.price ?? i.price;
    return {
      product_id: i.product_id,
      name: i.name,
      quantity: i.quantity,
      price: actualPrice,
    };
  });
  const totalPrice = orderItems.reduce(
    (sum, i) => sum + i.price * i.quantity,
    0,
  );

  // Create draft order
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      seller_id: seller.id,
      customer_id: customerId,
      status: "draft",
      items: orderItems,
      total_price: totalPrice,
      wilaya: customer.wilaya || null,
      commune: customer.commune || null,
      address: customer.address || null,
      notes: notes || null,
      source: "form",
      form_metadata: {
        custom_fields: customFields || {},
        ip: ip.slice(0, 45),
        submitted_at: new Date().toISOString(),
      },
    })
    .select("id, order_number")
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    orderId: order.id,
    orderNumber: order.order_number,
  });
}
