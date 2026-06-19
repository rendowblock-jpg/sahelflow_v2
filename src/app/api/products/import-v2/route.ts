/**
 * Import v2 API — Preview + Commit Pipeline
 */

import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";
import {
	runValidation,
	autoMapColumns,
	generateImportProducts,
} from "@/lib/import/engine";
import type { ColumnMapping, RawRow } from "@/lib/import/engine";
import type { SupabaseClient } from "@supabase/supabase-js";

const previewSchema = z.object({
	headers: z.array(z.string()),
	rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
	mapping: z.record(z.string(), z.number()).optional(),
	source: z.enum(["csv", "xlsx", "sheets", "manual"]).default("csv"),
	filename: z.string().optional(),
});

const commitSchema = z.object({
	batchId: z.string().uuid(),
	rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
	mapping: z.record(z.string(), z.number()),
	rowIndices: z.array(z.number()).optional(),
});

// Helper: fetch existing SKUs for deduplication
async function fetchExistingSkus(
	supabase: SupabaseClient,
	sellerId: string,
): Promise<Set<string>> {
	const { data, error } = await supabase
		.from("products")
		.select("sku")
		.eq("seller_id", sellerId)
		.not("sku", "is", null);

	if (error || !data) return new Set();
	return new Set(data.map((p) => p.sku as string));
}

// PREVIEW endpoint
export const POST = withAuthAndRateLimit(
	async (_req, { user: _user, sellerId, supabase, body }) => {
		const { headers, rows, mapping, source, filename } = body as z.infer<
			typeof previewSchema
		>;

		const resolvedMapping: ColumnMapping =
			mapping ?? (autoMapColumns(headers) as ColumnMapping);
		const existingSkus = await fetchExistingSkus(supabase, sellerId);

		const result = runValidation(
			rows as RawRow[],
			resolvedMapping,
			existingSkus,
		);

		// Create import batch record
		const { data: batch, error: batchError } = await supabase
			.from("import_batches")
			.insert({
				seller_id: sellerId,
				source,
				filename: filename || null,
				row_count: result.summary.total,
				created_count: 0,
				skipped_count: 0,
				error_count: result.summary.invalid,
				column_mapping: resolvedMapping,
				validation_errors: result.invalidRows.map((r) => ({
					row: r.index,
					errors: r.errors,
				})),
				status: "preview",
			})
			.select("id")
			.single();

		if (batchError) {
			console.log(JSON.stringify({ type: "import_v2_batch_error", error: batchError.message }));
		}

		return NextResponse.json({
			batchId: batch?.id || null,
			mapping: resolvedMapping,
			...result,
		});
	},
	{
		requirePermission: "products:manage",
		schema: previewSchema,
		rateLimitConfig: { maxRequests: 20, windowMs: 60000 },
	},
);

// COMMIT endpoint: receives rows again, validates, inserts
export const PATCH = withAuthAndRateLimit(
	async (_req, { user: _user, sellerId, supabase, body }) => {
		const { batchId, rows, mapping, rowIndices } = body as z.infer<
			typeof commitSchema
		>;

		const { data: batch, error: batchErr } = await supabase
			.from("import_batches")
			.select("id, status")
			.eq("id", batchId)
			.eq("seller_id", sellerId)
			.single();

		if (batchErr || !batch) {
			return NextResponse.json({ error: "Batch not found" }, { status: 404 });
		}

		if (batch.status === "completed") {
			return NextResponse.json(
				{ error: "Batch already committed" },
				{ status: 409 },
			);
		}

		// Validate
		const existingSkus = await fetchExistingSkus(supabase, sellerId);
		const result = runValidation(
			rows as RawRow[],
			mapping as ColumnMapping,
			existingSkus,
		);

		let targetRows = result.validRows;
		if (rowIndices && rowIndices.length > 0) {
			targetRows = targetRows.filter((r) => rowIndices.includes(r.index));
		}

		if (targetRows.length === 0) {
			return NextResponse.json(
				{ error: "No valid rows to import" },
				{ status: 422 },
			);
		}

		// Insert categories first
		const categoriesToCreate = new Map<string, string>();
		for (const row of targetRows) {
			const cat = row.data.category as string | undefined;
			if (cat && !categoriesToCreate.has(cat)) {
				const { data: existing } = await supabase
					.from("categories")
					.select("id")
					.eq("seller_id", sellerId)
					.ilike("name", cat)
					.limit(1)
					.single();

				if (existing) {
					categoriesToCreate.set(cat, existing.id);
				} else {
					const { data: created } = await supabase
						.from("categories")
						.insert({
							name: cat,
							slug: cat
								.toLowerCase()
								.replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
								.replace(/(^-|-$)/g, ""),
							seller_id: sellerId,
							sort_order: 999,
						})
						.select("id")
						.single();
					if (created) categoriesToCreate.set(cat, created.id);
				}
			}
		}

		// Insert products
		const products = generateImportProducts(targetRows, sellerId).map((p) => ({
			...p,
			category_id: p.category
				? categoriesToCreate.get(p.category) || null
				: null,
		}));

		const { error: insertError } = await supabase
			.from("products")
			.insert(products);

		if (insertError) {
			await supabase
				.from("import_batches")
				.update({ status: "failed", error_count: products.length })
				.eq("id", batchId);
			return NextResponse.json(
				{ error: `Insert failed: ${insertError.message}` },
				{ status: 500 },
			);
		}

		// Update batch
		await supabase
			.from("import_batches")
			.update({
				status: "completed",
				created_count: products.length,
				skipped_count: result.summary.willSkip,
				error_count: result.summary.invalid,
				committed_at: new Date().toISOString(),
			})
			.eq("id", batchId);

		return NextResponse.json({
			success: true,
			created: products.length,
			skipped: result.summary.willSkip,
			errors: result.invalidRows.length,
		});
	},
	{
		requirePermission: "products:manage",
		schema: commitSchema,
		rateLimitConfig: { maxRequests: 10, windowMs: 60000 },
	},
);
