import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendText } from "@/lib/channels/evolution-api";

/** Phase 6.3: Locale-aware WhatsApp digest builder */
interface DigestData {
	locale: string;
	today: string;
	sellerName: string;
	total_orders: number;
	confirmed_orders: number;
	shipped_orders: number;
	delivered_orders: number;
	returned_orders: number;
	refused_orders: number;
	revenue: number;
	topProducts: Array<{ name: string; quantity: number }>;
}

const DIGEST_MESSAGES = {
	ar: {
		greeting: (name: string) => `مرحبًا ${name}، إليك ملخص متجرك اليوم:`,
		ordersToday: "طلبيات اليوم",
		confirmed: "مؤكدة",
		shipped: "مرسلة",
		delivered: "مُسلّمة",
		returnedRefused: "مرتجعة/مرفوضة",
		estimatedRevenue: "إيراد تقديري",
		topProducts: "أكثر المنتجات مبيعًا اليوم",
		sold: "مبيعة",
		keepUp: "واصل العمل الرائع! 🚀",
		digestTitle: "ملخص SahelFlow اليومي",
	},
	fr: {
		greeting: (name: string) =>
			`Bonjour ${name}, voici le résumé quotidien de votre boutique :`,
		ordersToday: "Commandes aujourd'hui",
		confirmed: "Confirmées",
		shipped: "Expédiées",
		delivered: "Livrées",
		returnedRefused: "Retournées/Refusées",
		estimatedRevenue: "Revenu estimé",
		topProducts: "Top produits du jour",
		sold: "vendus",
		keepUp: "Continuez comme ça ! 🚀",
		digestTitle: "Résumé quotidien SahelFlow",
	},
	en: {
		greeting: (name: string) =>
			`Hello ${name}, here is your daily store summary:`,
		ordersToday: "Orders Today",
		confirmed: "Confirmed",
		shipped: "Shipped",
		delivered: "Delivered",
		returnedRefused: "Returned/Refused",
		estimatedRevenue: "Estimated Revenue",
		topProducts: "Top Products Today",
		sold: "sold",
		keepUp: "Keep up the great work! 🚀",
		digestTitle: "SahelFlow Daily Digest",
	},
} as const;

type DigestLocale = keyof typeof DIGEST_MESSAGES;

function buildWhatsAppDigest(data: DigestData): string {
	const loc = (
		data.locale in DIGEST_MESSAGES ? data.locale : "fr"
	) as DigestLocale;
	const msg = DIGEST_MESSAGES[loc];
	const sections = [
		`📊 *${msg.digestTitle} - ${data.today}*`,
		``,
		msg.greeting(data.sellerName),
		``,
		`📦 *${msg.ordersToday}:* ${data.total_orders}`,
		`✅ *${msg.confirmed}:* ${data.confirmed_orders}`,
		`🚚 *${msg.shipped}:* ${data.shipped_orders}`,
		`🎉 *${msg.delivered}:* ${data.delivered_orders}`,
		`🔄 *${msg.returnedRefused}:* ${data.returned_orders}/${data.refused_orders}`,
		`💰 *${msg.estimatedRevenue}:* ${data.revenue} DZD`,
	];
	if (data.topProducts.length > 0) {
		sections.push(``, `🔥 *${msg.topProducts}:*`);
		for (const [idx, p] of data.topProducts.entries()) {
			sections.push(`${idx + 1}. ${p.name} (${p.quantity} ${msg.sold})`);
		}
	}
	sections.push(``, msg.keepUp);
	return sections.join("\n");
}

/**
 * Daily Report Cron — Phase 5.1: Batch-optimized
 *
 * Previous: O(n) sequential — 5+ DB queries per seller in a loop.
 * Now: 2 batch queries (sellers + channels), 1 batch orders query,
 * parallel WhatsApp sends via Promise.allSettled().
 */

export async function GET(request: Request) {
	try {
		// 1. Authorize trigger
		const authHeader = request.headers.get("authorization");
		const { searchParams } = new URL(request.url);
		const secretParam = searchParams.get("secret");
		const expectedSecret = process.env.CRON_SECRET;
		const isAuthorized =
			(expectedSecret && authHeader === `Bearer ${expectedSecret}`) ||
			(expectedSecret && secretParam === expectedSecret) ||
			process.env.NODE_ENV === "development"; // Allow bypassing in local dev if CRON_SECRET is not set
		if (!isAuthorized) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		// Determine target report date
		const dateParam = searchParams.get("date");
		const today = dateParam || new Date().toISOString().split("T")[0]; // YYYY-MM-DD
		const startOfDay = `${today}T00:00:00.000Z`;
		const endOfDay = `${today}T23:59:59.999Z`;

		const adminClient = createAdminClient();

		// 2. Batch-fetch all sellers
		const { data: sellers, error: sellersErr } = await adminClient
			.from("sellers")
			.select("id, email, full_name, business_name, phone, default_locale");
		if (sellersErr) {
			return NextResponse.json({ error: sellersErr.message }, { status: 500 });
		}
		if (!sellers || sellers.length === 0) {
			return NextResponse.json({ message: "No sellers found", processed: 0 });
		}

		// 3. Batch-fetch ALL orders for today across all sellers (1 query instead of N)
		const sellerIds = sellers.map((s) => s.id);
		const { data: allOrders, error: ordersErr } = await adminClient
			.from("orders")
			.select("id, seller_id, status, total_price, items")
			.in("seller_id", sellerIds)
			.is("deleted_at", null)
			.gte("created_at", startOfDay)
			.lte("created_at", endOfDay);
		if (ordersErr) {
			console.error("Error fetching batch orders:", ordersErr);
			return NextResponse.json({ error: ordersErr.message }, { status: 500 });
		}

		// Group orders by seller_id for O(1) lookup
		const ordersBySeller: Record<string, typeof allOrders> = {};
		for (const order of allOrders || []) {
			const sid = order.seller_id as string;
			if (!ordersBySeller[sid]) ordersBySeller[sid] = [];
			ordersBySeller[sid].push(order);
		}

		// 4. Batch-fetch WhatsApp channels for all sellers with phone numbers
		const sellersWithPhone = sellers.filter((s) => s.phone);
		const phoneSellerIds = sellersWithPhone.map((s) => s.id);
		const { data: channels } = phoneSellerIds.length
			? await adminClient
					.from("channels")
					.select("seller_id, name")
					.in("seller_id", phoneSellerIds)
					.eq("type", "whatsapp")
			: { data: [] as Array<{ seller_id: string; name: string }> | null };

		// Index channels by seller_id
		const channelBySeller: Record<string, string> = {};
		for (const ch of channels || []) {
			if (ch.name) channelBySeller[ch.seller_id] = ch.name;
		}

		// 5. Process each seller using pre-fetched data (no per-seller DB queries)
		const activeStatuses = ["confirmed", "shipped", "delivered"];

		const processSeller = async (seller: (typeof sellers)[0]) => {
			const orders = ordersBySeller[seller.id] || [];

			const total_orders = orders.length;
			const confirmed_orders = orders.filter(
				(o) => o.status === "confirmed",
			).length;
			const shipped_orders = orders.filter(
				(o) => o.status === "shipped",
			).length;
			const delivered_orders = orders.filter(
				(o) => o.status === "delivered",
			).length;
			const returned_orders = orders.filter(
				(o) => o.status === "returned",
			).length;
			const refused_orders = orders.filter(
				(o) => o.status === "refused",
			).length;

			const revenue = orders
				.filter((o) => activeStatuses.includes(o.status))
				.reduce((sum, o) => sum + Number(o.total_price || 0), 0);

			// Top products
			const productQty: Record<string, number> = {};
			for (const order of orders) {
				if (order.items && Array.isArray(order.items)) {
					for (const item of order.items as Array<Record<string, unknown>>) {
						const name = String(
							item.name || item.product_name || "Unknown Product",
						);
						const quantity = Number(item.quantity || 1);
						productQty[name] = (productQty[name] || 0) + quantity;
					}
				}
			}
			const topProducts = Object.entries(productQty)
				.map(([name, quantity]) => ({ name, quantity }))
				.sort((a, b) => b.quantity - a.quantity)
				.slice(0, 5);

			// Save report
			const report = {
				seller_id: seller.id,
				report_date: today,
				total_orders,
				confirmed_orders,
				shipped_orders,
				delivered_orders,
				returned_orders,
				refused_orders,
				revenue,
				top_products: topProducts,
			};
			const { error: upsertErr } = await adminClient
				.from("daily_analytics_reports")
				.upsert(report, { onConflict: "seller_id,report_date" });
			if (upsertErr) {
				console.error(
					`Error saving daily report for seller ${seller.id}:`,
					upsertErr,
				);
			}

			// Send in-app notification
			const notificationTitle = `تقرير ملخص اليوم: ${today}`;
			const notificationMessage = `اليوم: تم معالجة ${total_orders} طلبيات. إجمالي المبيعات المؤكدة/المرسلة: ${revenue} د.ج.`;
			await adminClient.from("notifications").insert({
				seller_id: seller.id,
				type: "system",
				title: notificationTitle,
				message: notificationMessage,
				link: "/dashboard",
			});

			// Send WhatsApp digest if connected (using pre-fetched channel)
			// Phase 6.3: Locale-aware WhatsApp message
			let whatsappStatus = "skipped";
			const channelName = channelBySeller[seller.id];
			if (seller.phone && channelName) {
				const sellerLocale = seller.default_locale || "fr";
				const whatsappMsg = buildWhatsAppDigest({
					locale: sellerLocale,
					today,
					sellerName: seller.full_name || seller.business_name || "Owner",
					total_orders,
					confirmed_orders,
					shipped_orders,
					delivered_orders,
					returned_orders,
					refused_orders,
					revenue,
					topProducts,
				});
				try {
					await sendText(channelName, seller.phone, whatsappMsg);
					whatsappStatus = "sent";
				} catch (whatsappErr) {
					console.error(
						`Failed to send WhatsApp digest for seller ${seller.id}:`,
						whatsappErr,
					);
					whatsappStatus = "failed";
				}
			}

			return {
				seller_id: seller.id,
				business_name: seller.business_name,
				total_orders,
				revenue,
				whatsapp: whatsappStatus,
			};
		};

		// 6. Process all sellers in parallel with Promise.allSettled
		// (DB upserts + notifications are safe to run concurrently)
		const settled = await Promise.allSettled(sellers.map(processSeller));
		const results = settled
			.filter(
				(
					r,
				): r is PromiseFulfilledResult<
					Awaited<ReturnType<typeof processSeller>>
				> => r.status === "fulfilled",
			)
			.map((r) => r.value);

		// Log any rejections
		for (const r of settled) {
			if (r.status === "rejected") {
				console.error("Daily report seller processing rejected:", r.reason);
			}
		}

		return NextResponse.json({
			message: "Daily reports generated successfully",
			date: today,
			processed: results.length,
			results,
		});
	} catch (error: unknown) {
		console.error("Daily report cron failed:", error);
		return NextResponse.json(
			{
				error: "Internal Server Error",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
