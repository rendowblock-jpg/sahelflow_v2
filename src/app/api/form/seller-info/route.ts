import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const schema = z.object({
	slug: z.string().min(1),
});

export async function GET(req: Request) {
	// Rate limit public endpoint
	const ip = req.headers.get("x-forwarded-for") || "anonymous";
	const rl = rateLimit(`form-seller-info:${ip}`, 30, 60000);
	if (!rl.allowed) {
		return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
	}

	const { searchParams } = new URL(req.url);
	const parsed = schema.safeParse({ slug: searchParams.get("slug") });
	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
	}

	const { slug } = parsed.data;

	const supabase = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
	);

	const { data: seller, error: sellerError } = await supabase
		.from("sellers")
		.select("id, business_name, slug, form_enabled, form_config, phone")
		.eq("slug", slug)
		.single();

	if (sellerError || !seller) {
		return NextResponse.json({ error: "Seller not found" }, { status: 404 });
	}

	if (!seller.form_enabled) {
		return NextResponse.json(
			{ error: "Order form is disabled for this seller" },
			{ status: 403 },
		);
	}

	const { data: products, error: prodError } = await supabase
		.from("products")
		.select("id, name, price, stock, image_url, sku")
		.eq("seller_id", seller.id)
		.eq("active", true)
		.gt("stock", 0)
		.order("created_at", { ascending: false })
		.limit(100);

	if (prodError) {
		console.log(JSON.stringify({ type: "form_seller_info_error", error: prodError.message }));
	}

	return NextResponse.json({
		seller: {
			business_name: seller.business_name,
			slug: seller.slug,
			form_enabled: seller.form_enabled,
			form_config: seller.form_config,
			phone: seller.phone,
		},
		products: products || [],
	});
}
