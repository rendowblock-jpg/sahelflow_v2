/**
 * SahelFlow Fake Order Risk Engine
 *
 * Multi-factor risk scoring for Algerian e-commerce COD orders.
 * Detects fake orders before shipping to save delivery costs.
 *
 * Risk factors:
 * 1. Phone number history (repeat offenders, blacklist)
 * 2. Wilaya-level return rates
 * 3. Order behavior patterns (time, value, quantity)
 * 4. Customer profile age & history
 * 5. Message sentiment & AI extraction confidence
 */

import { WILAYAS } from "@/lib/data/wilayas";

// ===== TYPES =====

export interface RiskAssessment {
	overallScore: number; // 0-100 (0 = safe, 100 = high risk)
	level: "low" | "medium" | "high" | "critical";
	factors: RiskFactor[];
	recommendation: "auto_confirm" | "manual_review" | "call_verify" | "reject";
	explanation: string;
	explanationAr: string; // Darija explanation for the seller
}

export interface RiskFactor {
	id: string;
	name: string;
	nameAr: string;
	score: number; // 0-100 contribution
	weight: number; // 0-1 multiplier
	details: string;
}

export interface WilayaRiskProfile {
	wilaya: string;
	totalOrders: number;
	returnRate: number; // 0-1
	avgDeliveryTime: number; // days
	riskMultiplier: number; // 0.5-2.0
}

// ===== WILAYA RISK PROFILES =====
// Based on typical Algerian e-commerce return rates by region

const WILAYA_RISK_PROFILES_BASE: Record<string, WilayaRiskProfile> = {
	Alger: {
		wilaya: "Alger",
		totalOrders: 1200,
		returnRate: 0.12,
		avgDeliveryTime: 1,
		riskMultiplier: 0.8,
	},
	Oran: {
		wilaya: "Oran",
		totalOrders: 800,
		returnRate: 0.15,
		avgDeliveryTime: 2,
		riskMultiplier: 0.9,
	},
	Constantine: {
		wilaya: "Constantine",
		totalOrders: 600,
		returnRate: 0.18,
		avgDeliveryTime: 2,
		riskMultiplier: 1.0,
	},
	Blida: {
		wilaya: "Blida",
		totalOrders: 400,
		returnRate: 0.1,
		avgDeliveryTime: 1,
		riskMultiplier: 0.7,
	},
	Sétif: {
		wilaya: "Sétif",
		totalOrders: 350,
		returnRate: 0.22,
		avgDeliveryTime: 3,
		riskMultiplier: 1.2,
	},
	Batna: {
		wilaya: "Batna",
		totalOrders: 280,
		returnRate: 0.25,
		avgDeliveryTime: 3,
		riskMultiplier: 1.3,
	},
	Annaba: {
		wilaya: "Annaba",
		totalOrders: 300,
		returnRate: 0.16,
		avgDeliveryTime: 2,
		riskMultiplier: 0.9,
	},
	Tlemcen: {
		wilaya: "Tlemcen",
		totalOrders: 250,
		returnRate: 0.2,
		avgDeliveryTime: 3,
		riskMultiplier: 1.1,
	},
	Béjaïa: {
		wilaya: "Béjaïa",
		totalOrders: 320,
		returnRate: 0.19,
		avgDeliveryTime: 2,
		riskMultiplier: 1.0,
	},
	"Tizi Ouzou": {
		wilaya: "Tizi Ouzou",
		totalOrders: 350,
		returnRate: 0.28,
		avgDeliveryTime: 2,
		riskMultiplier: 1.4,
	},
	Djelfa: {
		wilaya: "Djelfa",
		totalOrders: 150,
		returnRate: 0.35,
		avgDeliveryTime: 4,
		riskMultiplier: 1.6,
	},
	Biskra: {
		wilaya: "Biskra",
		totalOrders: 180,
		returnRate: 0.3,
		avgDeliveryTime: 4,
		riskMultiplier: 1.5,
	},
	Ouargla: {
		wilaya: "Ouargla",
		totalOrders: 120,
		returnRate: 0.32,
		avgDeliveryTime: 5,
		riskMultiplier: 1.5,
	},
	Ghardaia: {
		wilaya: "Ghardaia",
		totalOrders: 100,
		returnRate: 0.15,
		avgDeliveryTime: 4,
		riskMultiplier: 1.0,
	},
	Adrar: {
		wilaya: "Adrar",
		totalOrders: 50,
		returnRate: 0.4,
		avgDeliveryTime: 6,
		riskMultiplier: 1.8,
	},
	Tamanrasset: {
		wilaya: "Tamanrasset",
		totalOrders: 30,
		returnRate: 0.45,
		avgDeliveryTime: 7,
		riskMultiplier: 2.0,
	},
};

const WILAYA_RISK_PROFILES: Record<string, WilayaRiskProfile> = {
	...WILAYA_RISK_PROFILES_BASE,
};

WILAYAS.forEach((w) => {
	if (!WILAYA_RISK_PROFILES[w.name]) {
		let returnRate = 0.2;
		let avgDeliveryTime = 3;
		let riskMultiplier = 1.2;

		switch (w.zone) {
			case "north":
				returnRate = 0.14;
				avgDeliveryTime = 2;
				riskMultiplier = 0.85;
				break;
			case "east":
			case "west":
				returnRate = 0.18;
				avgDeliveryTime = 3;
				riskMultiplier = 1.05;
				break;
			case "center":
				returnRate = 0.15;
				avgDeliveryTime = 2;
				riskMultiplier = 0.9;
				break;
			case "highPlateaux":
				returnRate = 0.28;
				avgDeliveryTime = 4;
				riskMultiplier = 1.4;
				break;
			case "south":
				returnRate = 0.38;
				avgDeliveryTime = 6;
				riskMultiplier = 1.8;
				break;
		}

		WILAYA_RISK_PROFILES[w.name] = {
			wilaya: w.name,
			totalOrders: 50,
			returnRate,
			avgDeliveryTime,
			riskMultiplier,
		};
	}
});

const DEFAULT_WILAYA_RISK: WilayaRiskProfile = {
	wilaya: "Unknown",
	totalOrders: 0,
	returnRate: 0.2,
	avgDeliveryTime: 3,
	riskMultiplier: 1.2,
};

// ===== RISK SCORING ENGINE =====

interface RiskInput {
	phone: string;
	wilaya: string;
	customerName: string;
	orderValue: number;
	itemCount: number;
	aiConfidence: number; // 0-1 from extraction engine
	messageCount: number; // messages in conversation
	orderHour: number; // 0-23
	hasAddress: boolean;
	isNewCustomer: boolean;
	customer?: {
		order_count: number;
		total_spent: number;
		is_blocked: boolean;
		returned_orders: number;
		wilaya_count: number;
		name_count: number;
	};
}

export function assessRisk(input: RiskInput): RiskAssessment {
	const factors: RiskFactor[] = [];

	// ─── Factor 1: Phone History ───
	const phoneScore = scorePhoneHistory(input);
	factors.push(phoneScore);

	// ─── Factor 2: Wilaya Risk ───
	const wilayaScore = scoreWilayaRisk(input.wilaya);
	factors.push(wilayaScore);

	// ─── Factor 3: Order Value Pattern ───
	const valueScore = scoreOrderValue(input.orderValue, input.itemCount);
	factors.push(valueScore);

	// ─── Factor 4: Behavioral Signals ───
	const behaviorScore = scoreBehavior(
		input.orderHour,
		input.messageCount,
		input.hasAddress,
		input.aiConfidence,
	);
	factors.push(behaviorScore);

	// ─── Factor 5: New Customer Risk ───
	const newCustScore = scoreNewCustomer(input);
	factors.push(newCustScore);

	// ─── Calculate Overall Score ───
	const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
	const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
	const overallScore = Math.min(100, Math.round(weightedScore / totalWeight));

	// ─── Determine Level & Recommendation ───
	let level: RiskAssessment["level"];
	let recommendation: RiskAssessment["recommendation"];
	let explanation: string;
	let explanationAr: string;

	if (overallScore >= 70) {
		level = "critical";
		recommendation = "reject";
		explanation = `Critical risk (${overallScore}%). This order has multiple high-risk indicators. Recommend rejecting or requiring full prepayment.`;
		explanationAr = `⛔ خطر كبير (${overallScore}%). هذا الطلب عندو عدة مؤشرات خطيرة. نوصيك ترفضه ولا تطلب الدفع المسبق.`;
	} else if (overallScore >= 45) {
		level = "high";
		recommendation = "call_verify";
		explanation = `High risk (${overallScore}%). Call the customer to verify before shipping. Check phone number and address.`;
		explanationAr = `⚠️ خطر عالي (${overallScore}%). عيّط للزبون قبل ما تبعث الكوليسة. تأكد من الرقم والعنوان.`;
	} else if (overallScore >= 25) {
		level = "medium";
		recommendation = "manual_review";
		explanation = `Medium risk (${overallScore}%). Review the order details manually before confirming.`;
		explanationAr = `👀 خطر متوسط (${overallScore}%). شوف تفاصيل الطلب مليح قبل ما تأكدو.`;
	} else {
		level = "low";
		recommendation = "auto_confirm";
		explanation = `Low risk (${overallScore}%). This order looks safe to process.`;
		explanationAr = `✅ خطر منخفض (${overallScore}%). هذا الطلب يبان آمن، تقدر تأكدو.`;
	}

	return {
		overallScore,
		level,
		factors,
		recommendation,
		explanation,
		explanationAr,
	};
}

// ─── Individual Factor Scorers ───

function scorePhoneHistory(input: RiskInput): RiskFactor {
	const { customer } = input;

	// No customer data → new phone, no history
	if (!customer) {
		return {
			id: "phone_new",
			name: "New Phone Number",
			nameAr: "رقم جديد",
			score: 30,
			weight: 0.25,
			details: "No order history for this phone number. First-time customer.",
		};
	}

	// Blocked customer → maximum risk
	if (customer.is_blocked) {
		return {
			id: "phone_blacklist",
			name: "Blocked Customer",
			nameAr: "زبون محظور",
			score: 100,
			weight: 0.35,
			details: "This customer has been blocked due to previous fraud or abuse.",
		};
	}

	let score = 0;

	// Return rate for this specific seller
	if (customer.order_count > 0) {
		const returnRate = customer.returned_orders / customer.order_count;
		if (returnRate >= 0.3 && customer.returned_orders >= 2) {
			// Repeat returner is a massive red flag (faux commande)
			score += 100;
		} else {
			score += returnRate * 100;
		}
	}

	// TODO: Cross-seller faux commande detection removed — per-client deployment model
	// means each Supabase project has only one seller. Re-enable if multi-tenant is adopted.

	// Multiple wilayas = suspicious
	if (customer.wilaya_count > 1) {
		score += 15;
	}

	// Multiple names = very suspicious
	if (customer.name_count > 1) {
		score += 25;
	}

	return {
		id: "phone_history",
		name: "Phone History",
		nameAr: "سجل الرقم",
		score: Math.min(100, Math.round(score)),
		weight: 0.3,
		details: `${customer.order_count} orders (${customer.returned_orders} returns), ${customer.wilaya_count} wilaya(s)`,
	};
}

function scoreWilayaRisk(wilaya: string): RiskFactor {
	const profile = WILAYA_RISK_PROFILES[wilaya] || DEFAULT_WILAYA_RISK;
	const score = Math.min(
		100,
		Math.round(profile.returnRate * 200 * profile.riskMultiplier),
	);

	return {
		id: "wilaya_risk",
		name: "Wilaya Risk",
		nameAr: "خطر الولاية",
		score,
		weight: 0.2,
		details: `${wilaya}: ${Math.round(profile.returnRate * 100)}% return rate, avg ${profile.avgDeliveryTime}d delivery`,
	};
}

function scoreOrderValue(orderValue: number, itemCount: number): RiskFactor {
	let score = 0;

	// Very high value orders are riskier
	if (orderValue > 15000) score += 30;
	else if (orderValue > 10000) score += 20;
	else if (orderValue > 5000) score += 10;

	// Large quantity of same item
	if (itemCount > 5) score += 20;
	else if (itemCount > 3) score += 10;

	return {
		id: "order_value",
		name: "Order Value",
		nameAr: "قيمة الطلب",
		score: Math.min(100, score),
		weight: 0.15,
		details: `Order: ${orderValue} DA, ${itemCount} items`,
	};
}

function scoreBehavior(
	hour: number,
	msgCount: number,
	hasAddress: boolean,
	aiConfidence: number,
): RiskFactor {
	let score = 0;

	// Late night orders (11PM - 5AM) are riskier
	if (hour >= 23 || hour < 5) score += 15;

	// Very few messages = quick/impulsive
	if (msgCount <= 1) score += 15;
	else if (msgCount <= 2) score += 5;

	// No address provided
	if (!hasAddress) score += 20;

	// Low AI extraction confidence
	if (aiConfidence < 0.3) score += 20;
	else if (aiConfidence < 0.5) score += 10;

	return {
		id: "behavior",
		name: "Behavioral Signals",
		nameAr: "إشارات السلوك",
		score: Math.min(100, score),
		weight: 0.2,
		details: `Hour: ${hour}:00, Messages: ${msgCount}, Address: ${hasAddress ? "Yes" : "No"}, AI: ${Math.round(aiConfidence * 100)}%`,
	};
}

function scoreNewCustomer(input: RiskInput): RiskFactor {
	if (input.customer && input.customer.order_count > 0) {
		return {
			id: "customer_age",
			name: "Repeat Customer",
			nameAr: "زبون متكرر",
			score: 0,
			weight: 0.1,
			details: `Returning customer with ${input.customer.order_count} previous orders.`,
		};
	}

	return {
		id: "customer_new",
		name: "New Customer",
		nameAr: "زبون جديد",
		score: 25,
		weight: 0.1,
		details: "First order from this customer. No history yet.",
	};
}

// ===== UTILITY FUNCTIONS =====

export function getWilayaRisk(wilaya: string): WilayaRiskProfile {
	return WILAYA_RISK_PROFILES[wilaya] || DEFAULT_WILAYA_RISK;
}

export function getAllWilayaRisks(): WilayaRiskProfile[] {
	return Object.values(WILAYA_RISK_PROFILES).sort(
		(a, b) => b.returnRate - a.returnRate,
	);
}

// ===== DYNAMIC WILAYA RISK PROFILES =====
// Phase 5.8: Dual-layer cache
// 1st layer: in-memory TTL cache (fast, per-instance)
// 2nd layer: wilaya_risk_profiles DB table (survives cold starts)
// If both miss, compute from orders and persist to DB.

// In-memory TTL cache: sellerId → { data, expiresAt } (1 hour)
const _wilayaProfileCache = new Map<
	string,
	{ data: Record<string, WilayaRiskProfile>; expiresAt: number }
>();
const WILAYA_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory TTL
const WILAYA_DB_STALE_MS = 4 * 60 * 60 * 1000; // 4 hours — recompute if DB data older

/**
 * Compute wilaya risk profiles from a seller's actual order data.
 *
 * Phase 5.8: Uses materialized wilaya_risk_profiles DB table
 * so cold starts don't require full table scans.
 * Falls back to in-memory cache → DB → fresh computation.
 */
export async function computeDynamicWilayaProfiles(
	sellerId: string,
): Promise<Record<string, WilayaRiskProfile>> {
	// Layer 1: In-memory cache (fastest)
	const cached = _wilayaProfileCache.get(sellerId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	const { createClient } = await import("@/lib/supabase/server");
	const supabase = await createClient();

	// Layer 2: Check materialized DB table (survives cold starts)
	const { data: dbProfiles } = await supabase
		.from("wilaya_risk_profiles")
		.select(
			"wilaya, total_orders, return_rate, avg_delivery_days, risk_multiplier, updated_at",
		)
		.eq("seller_id", sellerId);

	if (dbProfiles && dbProfiles.length > 0) {
		const newestUpdate = Math.max(
			...dbProfiles.map((p) => new Date(p.updated_at).getTime()),
		);

		// If DB profiles are fresh enough (< 4 hours), use them directly
		if (Date.now() - newestUpdate < WILAYA_DB_STALE_MS) {
			const profiles: Record<string, WilayaRiskProfile> = {};
			for (const p of dbProfiles) {
				profiles[p.wilaya] = {
					wilaya: p.wilaya,
					totalOrders: p.total_orders,
					returnRate: Number(p.return_rate),
					avgDeliveryTime: p.avg_delivery_days,
					riskMultiplier: Number(p.risk_multiplier),
				};
			}
			// Fill missing wilayas with static defaults
			for (const [name, profile] of Object.entries(WILAYA_RISK_PROFILES)) {
				if (!profiles[name]) profiles[name] = profile;
			}
			_wilayaProfileCache.set(sellerId, {
				data: profiles,
				expiresAt: Date.now() + WILAYA_CACHE_TTL_MS,
			});
			return profiles;
		}
	}

	// Layer 3: Fresh computation from orders (slowest, but accurate)
	const { data: orders } = await supabase
		.from("orders")
		.select("wilaya, status")
		.eq("seller_id", sellerId)
		.not("wilaya", "is", null);

	let profiles: Record<string, WilayaRiskProfile> = {};

	if (!orders || orders.length === 0) {
		profiles = { ...WILAYA_RISK_PROFILES };
		_wilayaProfileCache.set(sellerId, {
			data: profiles,
			expiresAt: Date.now() + WILAYA_CACHE_TTL_MS,
		});
		return profiles;
	}

	// Group orders by wilaya
	const byWilaya: Record<string, { total: number; returned: number }> = {};
	for (const o of orders) {
		const w = o.wilaya as string;
		if (!w) continue;
		if (!byWilaya[w]) byWilaya[w] = { total: 0, returned: 0 };
		byWilaya[w].total++;
		if (o.status === "returned" || o.status === "refused") {
			byWilaya[w].returned++;
		}
	}

	// Build dynamic profiles + collect rows for DB persistence
	const upsertRows: Array<{
		seller_id: string;
		wilaya: string;
		total_orders: number;
		return_rate: number;
		avg_delivery_days: number;
		risk_multiplier: number;
	}> = [];

	for (const [wilaya, stats] of Object.entries(byWilaya)) {
		const staticProfile = WILAYA_RISK_PROFILES[wilaya];
		const returnRate = stats.total > 0 ? stats.returned / stats.total : 0;

		// Blend: 60% seller's actual data, 40% static profile (prevents overfitting on small samples)
		const blendedReturnRate = staticProfile
			? returnRate * 0.6 + staticProfile.returnRate * 0.4
			: returnRate;

		// Risk multiplier: 1.0 at 15% return rate, scales up/down
		const riskMultiplier = Math.max(
			0.5,
			Math.min(2.0, blendedReturnRate / 0.15),
		);

		const roundedReturnRate = Math.round(blendedReturnRate * 100) / 100;
		const roundedRiskMultiplier = Math.round(riskMultiplier * 100) / 100;

		profiles[wilaya] = {
			wilaya,
			totalOrders: stats.total,
			returnRate: roundedReturnRate,
			avgDeliveryTime: staticProfile?.avgDeliveryTime || 3,
			riskMultiplier: roundedRiskMultiplier,
		};

		upsertRows.push({
			seller_id: sellerId,
			wilaya,
			total_orders: stats.total,
			return_rate: roundedReturnRate,
			avg_delivery_days: staticProfile?.avgDeliveryTime || 3,
			risk_multiplier: roundedRiskMultiplier,
		});
	}

	// Fill in missing wilayas with static defaults
	for (const [name, profile] of Object.entries(WILAYA_RISK_PROFILES)) {
		if (!profiles[name]) {
			profiles[name] = profile;
		}
	}

	// Persist computed profiles to DB for cold-start resilience
	if (upsertRows && upsertRows.length > 0) {
		try {
			const { createAdminClient } = await import("@/lib/supabase/server");
			const adminClient = createAdminClient();
			const { error: upsertErr } = await adminClient
				.from("wilaya_risk_profiles")
				.upsert(upsertRows, { onConflict: "seller_id,wilaya" });
			if (upsertErr) {
				console.error(
					"[risk-engine] Failed to persist wilaya profiles for seller",
					sellerId,
					upsertErr,
				);
			}
		} catch (persistErr) {
			console.error(
				"[risk-engine] Exception persisting wilaya profiles:",
				persistErr,
			);
		}
	}

	_wilayaProfileCache.set(sellerId, {
		data: profiles,
		expiresAt: Date.now() + WILAYA_CACHE_TTL_MS,
	});

	return profiles;
}

// ===== FETCH REAL CUSTOMER DATA =====

export async function fetchCustomerRiskData(
	phone: string,
	sellerId: string,
): Promise<RiskInput["customer"] | undefined> {
	const { createClient } = await import("@/lib/supabase/server");
	const supabase = await createClient();

	// Match last 9 digits of phone (handles country code variations)
	const phoneSuffix = phone.replace(/\D/g, "").slice(-9);

	const { data: customer } = await supabase
		.from("customers")
		.select("id, name, phone, is_blocked")
		.eq("seller_id", sellerId)
		.ilike("phone", `%${phoneSuffix}`)
		.limit(1)
		.single();

	if (!customer) return undefined;

	// Fetch order stats for this customer
	const { data: orders } = await supabase
		.from("orders")
		.select("id, status, wilaya, total_price")
		.eq("seller_id", sellerId)
		.eq("customer_id", customer.id);

	const allOrders = orders || [];
	const orderCount = allOrders.length;
	const returnedOrders = allOrders.filter(
		(o) => o.status === "returned" || o.status === "refused",
	).length;

	const uniqueWilayas = new Set(allOrders.map((o) => o.wilaya).filter(Boolean));
	// Customers only have one name now under the normalized schema
	const uniqueNames = new Set([customer.name].filter(Boolean));

	// Calculate total_spent from delivered orders in JS
	const totalSpent = allOrders
		.filter((o) => o.status === "delivered")
		.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

	return {
		order_count: orderCount,
		total_spent: totalSpent,
		is_blocked: customer.is_blocked || false,
		returned_orders: returnedOrders,
		wilaya_count: uniqueWilayas.size,
		name_count: uniqueNames.size,
	};
}
