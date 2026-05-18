import { describe, it, expect } from "vitest";
import {
	runValidation,
	autoMapColumns,
	FIELD_RULES,
	generateImportProducts,
} from "../engine";
import type { ColumnMapping, RawRow } from "../engine";

describe("Import Engine", () => {
	describe("autoMapColumns", () => {
		it("maps exact English headers", () => {
			const headers = ["name", "price", "stock", "sku", "category"];
			const result = autoMapColumns(headers);
			expect(result.name).toBe(0);
			expect(result.price).toBe(1);
			expect(result.stock).toBe(2);
			expect(result.sku).toBe(3);
			expect(result.category).toBe(4);
		});

		it("maps Arabic headers", () => {
			const headers = ["المنتج", "السعر", "المخزون", "الفئة"];
			const result = autoMapColumns(headers);
			expect(result.name).toBe(0);
			expect(result.price).toBe(1);
			expect(result.stock).toBe(2);
			expect(result.category).toBe(3);
		});

		it("maps French headers", () => {
			const headers = ["nom", "prix", "quantité", "catégorie"];
			const result = autoMapColumns(headers);
			expect(result.name).toBe(0);
			expect(result.price).toBe(1);
			expect(result.stock).toBe(2);
			expect(result.category).toBe(3);
		});

		it("handles fuzzy matching", () => {
			const headers = ["product_name", "sell_price", "qty", "ref"];
			const result = autoMapColumns(headers);
			expect(result.name).toBeDefined();
			expect(result.price).toBeDefined();
			expect(result.stock).toBeDefined();
			expect(result.sku).toBeDefined();
		});

		it("returns empty object for unknown headers", () => {
			const headers = ["foo", "bar", "baz"];
			const result = autoMapColumns(headers);
			expect(Object.keys(result)).toHaveLength(0);
		});
	});

	describe("runValidation", () => {
		const baseMapping: ColumnMapping = { name: 0, price: 1, stock: 2, sku: 3 };

		it("validates all valid rows", () => {
			const rows: RawRow[] = [
				["Product A", "1000", "10", "SKU-001"],
				["Product B", "2000", "5", "SKU-002"],
			];
			const result = runValidation(rows, baseMapping);
			expect(result.summary.total).toBe(2);
			expect(result.summary.valid).toBe(2);
			expect(result.summary.invalid).toBe(0);
			expect(result.summary.duplicates).toBe(0);
		});

		it("flags missing required name", () => {
			const rows: RawRow[] = [["", "1000", "10", "SKU-001"]];
			const result = runValidation(rows, baseMapping);
			expect(result.summary.invalid).toBe(1);
			expect(result.invalidRows[0].errors.some((e) => e.includes("name"))).toBe(
				true,
			);
		});

		it("flags invalid price", () => {
			const rows: RawRow[] = [["Product A", "-100", "10", "SKU-001"]];
			const result = runValidation(rows, baseMapping);
			expect(result.summary.invalid).toBe(1);
			expect(
				result.invalidRows[0].errors.some((e) => e.includes("price")),
			).toBe(true);
		});

		it("flags zero price", () => {
			const rows: RawRow[] = [["Product A", "0", "10", "SKU-001"]];
			const result = runValidation(rows, baseMapping);
			expect(result.summary.invalid).toBe(1);
		});

		it("flags duplicate SKUs", () => {
			const rows: RawRow[] = [
				["Product A", "1000", "10", "SKU-001"],
				["Product B", "2000", "5", "SKU-001"],
			];
			const result = runValidation(rows, baseMapping);
			expect(result.summary.duplicates).toBe(1);
		});

		it("flags duplicates against existing SKUs", () => {
			const rows: RawRow[] = [["Product A", "1000", "10", "SKU-EXISTING"]];
			const result = runValidation(
				rows,
				baseMapping,
				new Set(["SKU-EXISTING"]),
			);
			expect(result.summary.duplicates).toBe(1);
		});

		it("flags duplicate name+price without SKU", () => {
			const rows: RawRow[] = [
				["Product A", "1000", "10", ""],
				["Product A", "1000", "5", ""],
			];
			const result = runValidation(rows, baseMapping);
			expect(result.summary.duplicates).toBe(1);
		});

		it("warns when cost_price > price", () => {
			const rows: RawRow[] = [["Product A", "100", "1000", "SKU-001"]];
			const mappingWithCost: ColumnMapping = {
				name: 0,
				price: 1,
				cost_price: 2,
				sku: 3,
			};
			const result = runValidation(rows, mappingWithCost);
			expect(
				result.validRows[0].warnings.some((w) => w.includes("cost_price")),
			).toBe(true);
		});

		it("normalizes Arabic names", () => {
			const rows: RawRow[] = [["إختبار", "1000", "10", ""]];
			const result = runValidation(rows, baseMapping);
			expect(result.summary.valid).toBe(1);
			expect(result.validRows[0].data.name).toBe("اختبار");
		});

		it("parses numbers with currency symbols", () => {
			const rows: RawRow[] = [["Product A", "1,500.00 DZD", "10", ""]];
			const result = runValidation(rows, baseMapping);
			expect(result.summary.valid).toBe(1);
		});

		it("handles missing optional fields gracefully", () => {
			const rows: RawRow[] = [["Product A", "1000"]];
			const minimalMapping: ColumnMapping = { name: 0, price: 1 };
			const result = runValidation(rows, minimalMapping);
			expect(result.summary.valid).toBe(1);
			expect(result.validRows[0].data.stock).toBeUndefined();
		});
	});

	describe("FIELD_RULES", () => {
		it("name rule rejects empty strings", () => {
			const error = FIELD_RULES.name.validate!("");
			expect(error).not.toBeNull();
		});

		it("name rule accepts normal names", () => {
			const error = FIELD_RULES.name.validate!("Parfum Elite");
			expect(error).toBeNull();
		});

		it("price rule rejects negative numbers", () => {
			const error = FIELD_RULES.price.validate!(-10);
			expect(error).not.toBeNull();
		});

		it("price rule rejects zero", () => {
			const error = FIELD_RULES.price.validate!(0);
			expect(error).not.toBeNull();
		});

		it("stock rule rejects negative values", () => {
			const error = FIELD_RULES.stock.validate!(-1);
			expect(error).not.toBeNull();
		});
	});

	describe("generateImportProducts", () => {
		it("generates insertable product objects", () => {
			const rows = [
				{
					index: 1,
					data: {
						name: "Product A",
						price: 1000,
						stock: 10,
						sku: "SKU-001",
						category: "Perfumes",
					},
					errors: [],
					warnings: [],
					isValid: true,
					isDuplicate: false,
				},
			] as Parameters<typeof generateImportProducts>[0];

			const products = generateImportProducts(rows, "seller-123");
			expect(products).toHaveLength(1);
			expect(products[0]).toMatchObject({
				seller_id: "seller-123",
				name: "Product A",
				price: 1000,
				stock: 10,
				sku: "SKU-001",
				category: "Perfumes",
			});
		});
	});
});
