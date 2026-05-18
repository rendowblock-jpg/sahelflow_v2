import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";

const syncSchema = z.object({
  platform: z.enum(["shopify", "woocommerce", "youcan"]),
});

interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string;
  variants?: Array<{
    id: number;
    title: string;
    price: string;
    sku?: string;
    inventory_quantity?: number;
  }>;
  images?: Array<{ src: string }>;
  image?: { src: string };
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

// ── WooCommerce Types ──
interface WooCommerceProduct {
  id: number;
  name: string;
  description?: string;
  price?: string;
  regular_price?: string;
  sku?: string;
  stock_quantity?: number | null;
  images?: Array<{ src: string }>;
  attributes?: Array<{
    name: string;
    options: string[];
  }>;
}

function mapWooCommerceProduct(
  wooProduct: WooCommerceProduct,
  sellerId: string,
) {
  const price =
    parseFloat(wooProduct.price || wooProduct.regular_price || "0") || 0;
  // SAFETY: unknown stock = 0 (don't let phantom inventory cause oversells)
  const stock = wooProduct.stock_quantity ?? 0;
  const imageUrl = wooProduct.images?.[0]?.src || null;

  // Convert WooCommerce attributes to SahelFlow variants
  const variants =
    wooProduct.attributes?.map((attr) => ({
      id: String(attr.name),
      name: attr.name,
      options: attr.options,
    })) || [];

  return {
    seller_id: sellerId,
    name: wooProduct.name,
    sku: wooProduct.sku || null,
    description: wooProduct.description || null,
    variants,
    category_id: null,
    stock,
    price,
    cost_price: 0,
    image_url: imageUrl,
    active: true,
  };
}

function mapShopifyProduct(shopifyProduct: ShopifyProduct, sellerId: string) {
  const variants =
    shopifyProduct.variants?.map((v) => ({
      id: String(v.id),
      name: v.title || "Default",
      options: v.title ? [v.title] : ["Default"],
    })) || [];

  const price = shopifyProduct.variants?.[0]
    ? parseFloat(shopifyProduct.variants[0].price) || 0
    : 0;

  // SAFETY: unknown stock = 0 (don't let phantom inventory cause oversells)
  const stock =
    shopifyProduct.variants?.reduce(
      (sum, v) => sum + (v.inventory_quantity ?? 0),
      0,
    ) ?? 0;

  const imageUrl =
    shopifyProduct.images?.[0]?.src || shopifyProduct.image?.src || null;

  return {
    seller_id: sellerId,
    name: shopifyProduct.title,
    sku: shopifyProduct.variants?.[0]?.sku || null,
    description: shopifyProduct.body_html || null,
    variants,
    category_id: null,
    stock,
    price,
    cost_price: 0,
    image_url: imageUrl,
    active: true,
  };
}

// ── YouCan Types ──
interface YouCanProduct {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  price: number;
  compare_at_price?: number | null;
  inventory?: number;
  track_inventory?: boolean;
  images?: Array<{ url: string }>;
  variants?: Array<{
    id: string;
    variations?: Record<string, string>;
    options?: string[];
    price: number;
    inventory?: number;
    sku?: string;
  }>;
}

interface YouCanProductsResponse {
  data: YouCanProduct[];
}

function mapYouCanProduct(youcanProduct: YouCanProduct, sellerId: string) {
  const variants =
    youcanProduct.variants?.map((v) => ({
      id: String(v.id),
      name: v.options?.join(" / ") || "Default",
      options: v.options || ["Default"],
    })) || [];

  const price = youcanProduct.price || 0;
  const stock = youcanProduct.inventory ?? 0;
  const imageUrl = youcanProduct.images?.[0]?.url || null;

  return {
    seller_id: sellerId,
    name: youcanProduct.name,
    sku: youcanProduct.variants?.[0]?.sku || null,
    description: youcanProduct.description || null,
    variants,
    category_id: null,
    stock,
    price,
    cost_price: 0,
    image_url: imageUrl,
    active: true,
  };
}

export const POST = withAuthAndRateLimit(
  async (_req, { user, supabase, body }) => {
    const { platform } = body!;

    // Look up the seller's integration credentials
    const { data: integration, error: intError } = await supabase
      .from("integrations")
      .select("*")
      .eq("seller_id", user.id)
      .eq("platform", platform)
      .eq("is_active", true)
      .single();

    if (intError || !integration) {
      return NextResponse.json(
        { error: `No ${platform} integration found` },
        { status: 404 },
      );
    }

    const credentials = integration.credentials as Record<string, string>;

    if (platform === "shopify") {
      const shopUrl = credentials.shop_url;
      const accessToken = credentials.access_token;

      if (!shopUrl || !accessToken) {
        return NextResponse.json(
          { error: "Missing Shopify credentials (shop_url, access_token)" },
          { status: 400 },
        );
      }

      // SECURITY: Validate that shopUrl is a legitimate Shopify domain before fetching
      const shopifyDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
      if (!shopifyDomainRegex.test(shopUrl)) {
        console.error("Invalid Shopify domain:", shopUrl);
        return NextResponse.json(
          {
            error:
              "Invalid Shopify domain. Must be a *.myshopify.com hostname.",
          },
          { status: 400 },
        );
      }

      // Fetch products from Shopify
      const shopifyUrl = `https://${shopUrl}/admin/api/2024-01/products.json?limit=250`;
      const shopifyRes = await fetch(shopifyUrl, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      if (!shopifyRes.ok) {
        return NextResponse.json(
          {
            error: `Shopify API error: ${shopifyRes.status}`,
          },
          { status: 502 },
        );
      }

      const shopifyData: ShopifyProductsResponse = await shopifyRes.json();
      const products = shopifyData.products || [];

      if (products.length === 0) {
        return NextResponse.json({ success: true, count: 0 });
      }

      // Map to SahelFlow Product schema
      const mapped = products.map((p) => mapShopifyProduct(p, user.id));

      // Bulk upsert into products table (match on seller_id + name)
      const { data: upserted, error: upsertError } = await supabase
        .from("products")
        .upsert(mapped, { onConflict: "seller_id,name" })
        .select("id");

      if (upsertError) {
        return NextResponse.json(
          { error: "Failed to upsert products", details: upsertError.message },
          { status: 500 },
        );
      }

      // Update last_sync timestamp on the integration
      await supabase
        .from("integrations")
        .update({ last_sync: new Date().toISOString() })
        .eq("id", integration.id);

      return NextResponse.json({
        success: true,
        count: upserted?.length || 0,
      });
    }

    // ── WOOCOMMERCE SYNC ──
    if (platform === "woocommerce") {
      const storeUrl = credentials.store_url;
      const consumerKey = credentials.consumer_key;
      const consumerSecret = credentials.consumer_secret;

      if (!storeUrl || !consumerKey || !consumerSecret) {
        return NextResponse.json(
          {
            error:
              "Missing WooCommerce credentials (store_url, consumer_key, consumer_secret)",
          },
          { status: 400 },
        );
      }

      // SECURITY: Basic Auth sends credentials in plaintext. Reject non-HTTPS URLs.
      if (!storeUrl.startsWith("https://")) {
        return NextResponse.json(
          {
            error:
              "WooCommerce store URL must use HTTPS to protect API credentials. Please update your store URL in Settings → Integrations.",
          },
          { status: 400 },
        );
      }

      // WooCommerce REST API v3 — fetch all products with pagination
      const baseUrl = storeUrl.replace(/\/$/, "");
      const allWooProducts: WooCommerceProduct[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 10) {
        const wooUrl = `${baseUrl}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`;
        const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
          "base64",
        );

        const wooRes = await fetch(wooUrl, {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
        });

        if (!wooRes.ok) {
          return NextResponse.json(
            { error: `WooCommerce API error: ${wooRes.status}` },
            { status: 502 },
          );
        }

        const pageProducts: WooCommerceProduct[] = await wooRes.json();
        if (pageProducts.length === 0) {
          hasMore = false;
        } else {
          allWooProducts.push(...pageProducts);
          page++;
        }
      }

      if (allWooProducts.length === 0) {
        return NextResponse.json({ success: true, count: 0 });
      }

      // Map to SahelFlow Product schema
      const mapped = allWooProducts.map((p) =>
        mapWooCommerceProduct(p, user.id),
      );

      // Bulk upsert into products table (match on seller_id + name)
      const { data: upserted, error: upsertError } = await supabase
        .from("products")
        .upsert(mapped, { onConflict: "seller_id,name" })
        .select("id");

      if (upsertError) {
        return NextResponse.json(
          { error: "Failed to upsert products", details: upsertError.message },
          { status: 500 },
        );
      }

      // Update last_sync timestamp on the integration
      await supabase
        .from("integrations")
        .update({ last_sync: new Date().toISOString() })
        .eq("id", integration.id);

      return NextResponse.json({
        success: true,
        count: upserted?.length || 0,
      });
    }

    // ── YOUCAN SYNC ──
    if (platform === "youcan") {
      const storeUrl = credentials.store_url;
      const accessToken = credentials.access_token;

      if (!storeUrl || !accessToken) {
        return NextResponse.json(
          {
            error: "Missing YouCan credentials (store_url, access_token)",
          },
          { status: 400 },
        );
      }

      // SECURITY: Reject non-HTTPS URLs
      if (!storeUrl.startsWith("https://")) {
        return NextResponse.json(
          {
            error:
              "YouCan store URL must use HTTPS. Please provide the full URL including https://",
          },
          { status: 400 },
        );
      }

      const baseUrl = storeUrl.replace(/\/$/, "");
      const youcanUrl = `${baseUrl}/products`;

      const youcanRes = await fetch(youcanUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!youcanRes.ok) {
        return NextResponse.json(
          { error: `YouCan API error: ${youcanRes.status}` },
          { status: 502 },
        );
      }

      const youcanData: YouCanProductsResponse = await youcanRes.json();
      const products = youcanData.data || [];

      if (products.length === 0) {
        return NextResponse.json({ success: true, count: 0 });
      }

      const mapped = products.map((p) => mapYouCanProduct(p, user.id));

      const { data: upserted, error: upsertError } = await supabase
        .from("products")
        .upsert(mapped, { onConflict: "seller_id,name" })
        .select("id");

      if (upsertError) {
        return NextResponse.json(
          { error: "Failed to upsert products", details: upsertError.message },
          { status: 500 },
        );
      }

      await supabase
        .from("integrations")
        .update({ last_sync: new Date().toISOString() })
        .eq("id", integration.id);

      return NextResponse.json({
        success: true,
        count: upserted?.length || 0,
      });
    }

    return NextResponse.json(
      { error: `Unsupported platform: ${platform}` },
      { status: 400 },
    );
  },
  {
    schema: syncSchema,
    rateLimitConfig: { maxRequests: 5, windowMs: 60000 },
  },
);
