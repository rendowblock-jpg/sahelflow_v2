import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";

/**
 * Product Import — Phase 5.2: Batch-optimized
 *
 * Previous: N+1 queries — each product triggered 1-3 sequential DB calls
 * (category lookup, SKU dedup check, insert). 500 products = 1500-2000 queries.
 *
 * Now: 2 pre-fetch queries (categories + existing SKUs), then batch inserts in chunks of 50.
 */

const importSchema = z.object({
	products: z
		.array(
			z.object({
				name: z.string().min(1),
				price: z.coerce.number().min(0),
				cost_price: z.coerce.number().optional(),
				stock: z.coerce.number().optional(),
				sku: z.string().optional(),
				description: z.string().optional(),
				category: z.string().optional(),
			}),
		)
		.min(1)
		.max(500),
});

const BATCH_SIZE = 50;

export const POST = withAuthAndRateLimit(
	async (req, { user: _user, sellerId, supabase, body }) => {
		const { products } = body as z.infer<typeof importSchema>;

		const results = { created: 0, skipped: 0, errors: [] as string[] };

		// ── Step 1: Pre-fetch all existing categories into a Map ──
		const { data: existingCategories } = await supabase
			.from("categories")
			.select("id, name")
			.eq("seller_id", sellerId);

		const categoryMap = new Map<string, string>();
		for (const cat of existingCategories || []) {
			// Normalize: lowercase, trimmed for case-insensitive matching
			categoryMap.set(cat.name.toLowerCase().trim(), cat.id);
		}

		// ── Step 2: Pre-fetch all existing SKUs into a Set ──
		const skusToCheck = products.filter((p) => p.sku).map((p) => p.sku!);
		const existingSkuSet = new Set<string>();
		if (skusToCheck.length > 0) {
			const { data: existingProducts } = await supabase
				.from("products")
				.select("sku")
				.eq("seller_id", sellerId)
				.in("sku", skusToCheck);
			for (const p of existingProducts || []) {
				if (p.sku) existingSkuSet.add(p.sku);
			}
		}

		// ── Step 3: Build insert batch, resolve categories, skip duplicates ──
		const toInsert: Array<Record<string, unknown>> = [];
		let categorySortOffset = 999;

		for (let i = 0; i < products.length; i++) {
			const p = products[i];

			// Skip duplicates by SKU
			if (p.sku && existingSkuSet.has(p.sku)) {
				results.skipped++;
				continue;
			}

			// Resolve category_id from pre-fetched map
			let category_id: string | null = null;
			if (p.category) {
				const normalizedName = p.category.toLowerCase().trim();
				category_id = categoryMap.get(normalizedName) || null;

				// If category doesn't exist, create it and add to map
				if (!category_id) {
					const { data: newCat, error: catErr } = await supabase
						.from("categories")
						.insert({
							name: p.category,
							slug: p.category
								.toLowerCase()
								.replace(/[^a-z0-9]+/g, "-")
								.replace(/(^-|-$)/g, ""),
							seller_id: sellerId,
							sort_order: categorySortOffset++,
						})
						.select("id")
						.single();
					if (!catErr && newCat) {
						category_id = newCat.id;
						categoryMap.set(normalizedName, newCat.id);
					}
				}
			}

			toInsert.push({
				seller_id: sellerId,
				name: p.name,
				price: p.price,
				cost_price: p.cost_price || null,
				stock: p.stock ?? 0,
				sku: p.sku || null,
				description: p.description || null,
				category_id,
			});

			// Mark SKU as used to prevent intra-batch duplicates
			if (p.sku) existingSkuSet.add(p.sku);
		}

		// ── Step 4: Batch insert in chunks of BATCH_SIZE ──
		for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
			const chunk = toInsert.slice(i, i + BATCH_SIZE);
			const { error, count } = await supabase
				.from("products")
				.insert(chunk, { count: "exact" });

			if (error) {
				// If batch insert fails, fall back to individual inserts for this chunk
				// to isolate which rows have errors
				for (const row of chunk) {
					const { error: singleErr } = await supabase
						.from("products")
						.insert(row);
					if (singleErr) {
						results.errors.push(
							`${(row as Record<string, unknown>).name as string || "Row"}: ${singleErr.message}`,
						);
					} else {
						results.created++;
					}
				}
			} else {
				results.created += count || chunk.length;
			}
		}

		return NextResponse.json(results);
	},
	{
		requirePermission: "products:manage",
		schema: importSchema,
		rateLimitConfig: { maxRequests: 10, windowMs: 60000 },
	},
);
