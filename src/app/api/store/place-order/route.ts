import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { createAdminClient } from "@/lib/supabase/server";
import { z } from "zod";
import { computeDeliveryCost } from "@/lib/data/shipping-service";
import { tApi } from "@/lib/i18n/server";

const placeOrderSchema = z.object({
  form: z.object({
    name: z.string().min(1, "Name is required"),
    phone: z
      .string()
      .regex(
        /^(0)?(5|6|7)\d{8}$/,
        "Must be a valid Algerian mobile number (05/06/07XXXXXXXX)",
      ),
    wilaya: z.string().min(1, "Wilaya is required"),
    commune: z.string().min(1, "Commune is required"),
    address: z.string().min(1, "Address is required"),
    notes: z.string().optional(),
  }),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.number().int().min(1),
        price: z.number().min(0),
        product_id: z.string().uuid(),
        variant: z.string().optional(),
      }),
    )
    .min(1, "Cart is empty"),
  total: z.number().min(0),
  deliveryCost: z.number().min(0),
  deliveryType: z.enum(["home", "desk"]).optional(),
});

export const POST = withAuthAndRateLimit(
  async (req, { body }) => {
    const { form, items, deliveryType } = body!;

    const adminClient = createAdminClient();

    // 1. Derive seller_id server-side (per-client deployment = single seller row)
    const { data: sellerRow, error: sellerErr } = await adminClient
      .from("sellers")
      .select("id, shipping_rates")
      .limit(1)
      .single();

    if (sellerErr || !sellerRow) {
      return NextResponse.json(
        { error: tApi("storeNotFound", req) },
        { status: 404 },
      );
    }
    const sellerId = sellerRow.id;

    // Server-side delivery cost computation — never trust client-supplied cost
    const serverDeliveryCost = computeDeliveryCost(
      form.wilaya,
      deliveryType || "home",
      sellerRow.shipping_rates as Record<
        string,
        { home: number; desk: number }
      > | null,
    );

    // 2. Validate products and compute server-side prices
    const productIds = items.map((i: { product_id: string }) => i.product_id);
    const { data: dbProducts } = await adminClient
      .from("products")
      .select("id, name, price, stock")
      .eq("seller_id", sellerId)
      .in("id", productIds);

    if (!dbProducts || dbProducts.length === 0) {
      return NextResponse.json(
        { error: tApi("productsNotFound", req) },
        { status: 400 },
      );
    }

    const productMap = new Map(dbProducts.map((p) => [p.id, p]));

    const rpcItems = items.map(
      (i: {
        product_id: string;
        name: string;
        quantity: number;
        price: number;
        variant?: string | null;
      }) => {
        const dbProduct = productMap.get(i.product_id);
        if (!dbProduct) throw new Error(`Product ${i.product_id} is invalid`);

        return {
          product_id: i.product_id,
          product_name: dbProduct.name || i.name,
          quantity: i.quantity,
          unit_price: dbProduct.price || 0,
          variant: i.variant || null,
        };
      },
    );

    const serverSubtotal = rpcItems.reduce(
      (sum: number, i: { unit_price: number; quantity: number }) =>
        sum + i.unit_price * i.quantity,
      0,
    );

    // 3. Call atomic_create_order RPC (single transaction: stock verify, customer upsert, order insert)
    const { data: orderResult, error: rpcError } = await adminClient.rpc(
      "atomic_create_order",
      {
        p_seller_id: sellerId,
        p_customer_name: form.name,
        p_customer_phone: form.phone,
        p_customer_wilaya: form.wilaya,
        p_customer_commune: form.commune,
        p_customer_address: form.address,
        p_items: rpcItems,
        p_total_price: serverSubtotal,
        p_delivery_cost: serverDeliveryCost,
        p_net_profit: 0,
        p_wilaya: form.wilaya,
        p_commune: form.commune,
        p_address: form.address,
        p_source: "store",
        p_external_id: null,
        p_notes: form.notes || null,
        p_delivery_type: deliveryType || "home",
        p_status: "pending",
      },
    );

    if (rpcError) {
      console.log(JSON.stringify({ type: "place_order", action: "rpc_error", error: rpcError.message }));
      const msg = rpcError.message || tApi("failedToCreateOrder", req);
      if (msg.includes("Insufficient stock")) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const result = orderResult as Record<string, unknown>;
    const orderId = result.order_id as string;
    const orderNum = result.order_number as string;
    const customerId = result.customer_id as string | null;

    // 3b. Duplicate detection — flag if same phone has pending/draft order within 24h
    if (customerId) {
      try {
        const { data: dupes } = await adminClient
          .from("orders")
          .select("id, order_number")
          .eq("seller_id", sellerId)
          .eq("customer_id", customerId)
          .in("status", ["draft", "pending"])
          .neq("id", orderId)
          .gte(
            "created_at",
            new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          )
          .limit(1);

        if (dupes && dupes.length > 0) {
          await adminClient
            .from("orders")
            .update({ confirmation_status: "doublon" })
            .eq("id", orderId);
          await adminClient.from("agent_activity").insert({
            seller_id: sellerId,
            type: "alert",
            title: "Duplicate order detected",
            description: `Order ${orderNum} shares a phone number with existing order ${dupes[0].order_number}`,
            metadata: { order_id: orderId, duplicate_of: dupes[0].id },
          });
        }
      } catch (dupErr) {
        console.log(JSON.stringify({
          type: "place_order",
          action: "duplicate_detection_error",
          error: dupErr instanceof Error ? dupErr.message : String(dupErr),
        }));
      }
    }

    // 4. Dispatch internal webhook for AI agent processing (fire-and-forget with retries)
    const internalSecret = process.env.INTERNAL_WEBHOOK_SECRET;
    const webhookPayload = JSON.stringify({
      type: "order.created",
      orderId,
      sellerId,
    });

    const dispatchWebhook = async (maxRetries = 3) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/internal`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(internalSecret
                  ? { "x-internal-secret": internalSecret }
                  : {}),
              },
              body: webhookPayload,
            },
          );
          if (res.ok) return;
          console.log(JSON.stringify({
            type: "place_order",
            action: "webhook_retry_error",
            attempt: `${attempt}/${maxRetries}`,
            status: res.status,
          }));
        } catch (err) {
          console.log(JSON.stringify({
            type: "place_order",
            action: "webhook_attempt_error",
            attempt: `${attempt}/${maxRetries}`,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
      console.log(JSON.stringify({
        type: "place_order",
        action: "webhook_exhausted",
        orderId,
      }));
    };

    try {
      await dispatchWebhook();
    } catch (err) {
      console.log(JSON.stringify({
        type: "place_order",
        action: "webhook_dispatch_error",
        orderId,
        error: err instanceof Error ? err.message : String(err),
      }));
    }

    return NextResponse.json({ success: true, orderNumber: orderNum, orderId });
  },
  {
    schema: placeOrderSchema,
    requireAuth: false,
    rateLimitConfig: { maxRequests: 10, windowMs: 60000 },
  },
);
