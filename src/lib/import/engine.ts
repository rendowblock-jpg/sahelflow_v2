/**
 * Import Validation Engine
 * Transforms raw 2D arrays into validated product rows
 */

export type { RawRow } from "./parsers";
import type { RawRow } from "./parsers";

export type ImportField =
	| "name"
	| "price"
	| "cost_price"
	| "stock"
	| "sku"
	| "description"
	| "category";

export interface ColumnMapping {
	[field: string]: number; // field name → column index
}

export interface ValidationRule {
	field: ImportField;
	required: boolean;
	transform?: (value: string) => unknown;
	validate?: (value: unknown) => string | null; // returns error message or null
}

export interface ValidatedRow {
	index: number; // original row index (1-based, excluding header)
	data: Record<string, unknown>;
	errors: string[];
	warnings: string[];
	isValid: boolean;
	isDuplicate: boolean;
}

export interface EngineResult {
	validRows: ValidatedRow[];
	invalidRows: ValidatedRow[];
	duplicateRows: ValidatedRow[];
	summary: {
		total: number;
		valid: number;
		invalid: number;
		duplicates: number;
		willCreate: number;
		willSkip: number;
	};
}

const MAX_PRICE = 10_000_000;
const MAX_NAME_LENGTH = 200;
const MAX_SKU_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 2000;

function parseNumber(value: string): number | null {
	if (!value || value.trim() === "") return null;
	const cleaned = value.replace(/[^\d.-]/g, "").replace(/\.(?=.*\.)/g, "");
	const num = Number(cleaned);
	return Number.isFinite(num) ? num : null;
}

function normalizeArabic(text: string): string {
	return text
		.replace(/[إأآا]/g, "ا")
		.replace(/ى/g, "ي")
		.replace(/ؤ/g, "و")
		.replace(/ئ/g, "ي")
		.replace(/ة/g, "ه")
		.trim();
}

export const FIELD_RULES: Record<ImportField, ValidationRule> = {
	name: {
		field: "name",
		required: true,
		transform: (v) => normalizeArabic(v).slice(0, MAX_NAME_LENGTH),
		validate: (v) => {
			const s = String(v).trim();
			if (!s) return "الاسم مطلوب";
			if (s.length > MAX_NAME_LENGTH)
				return `الاسم طويل جداً (الحد الأقصى ${MAX_NAME_LENGTH})`;
			return null;
		},
	},
	price: {
		field: "price",
		required: true,
		transform: (v) => parseNumber(v),
		validate: (v) => {
			if (v === null || v === undefined) return "السعر مطلوب";
			const n = Number(v);
			if (!Number.isFinite(n) || n <= 0) return "السعر يجب أن يكون أكبر من صفر";
			if (n > MAX_PRICE) return `السعر يتجاوز الحد الأقصى (${MAX_PRICE} د.ج)`;
			return null;
		},
	},
	cost_price: {
		field: "cost_price",
		required: false,
		transform: (v) => parseNumber(v),
		validate: (v) => {
			if (v === null || v === undefined) return null;
			const n = Number(v);
			if (!Number.isFinite(n) || n < 0)
				return "سعر التكلفة يجب أن يكون 0 أو أكثر";
			if (n > MAX_PRICE) return `سعر التكلفة يتجاوز الحد الأقصى`;
			return null;
		},
	},
	stock: {
		field: "stock",
		required: false,
		transform: (v) => {
			const n = parseNumber(v);
			return n === null ? 0 : Math.floor(Math.max(0, n));
		},
		validate: (v) => {
			const n = Number(v);
			if (!Number.isInteger(n) || n < 0)
				return "المخزون يجب أن يكون عدداً صحيحاً موجباً";
			return null;
		},
	},
	sku: {
		field: "sku",
		required: false,
		transform: (v) => v.trim().slice(0, MAX_SKU_LENGTH),
		validate: (v) => {
			if (!v) return null;
			const s = String(v).trim();
			if (s.length > MAX_SKU_LENGTH)
				return `الرمز طويل جداً (الحد الأقصى ${MAX_SKU_LENGTH})`;
			return null;
		},
	},
	description: {
		field: "description",
		required: false,
		transform: (v) => v.trim().slice(0, MAX_DESCRIPTION_LENGTH),
		validate: (v) => {
			if (!v) return null;
			if (String(v).length > MAX_DESCRIPTION_LENGTH) return "الوصف طويل جداً";
			return null;
		},
	},
	category: {
		field: "category",
		required: false,
		transform: (v) => normalizeArabic(v).trim(),
		validate: () => null,
	},
};

export function runValidation(
	rows: RawRow[],
	mapping: ColumnMapping,
	existingSkus: Set<string> = new Set(),
): EngineResult {
	const seenSkus = new Set<string>();
	const seenNames = new Set<string>();
	const validatedRows: ValidatedRow[] = [];

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const data: Record<string, unknown> = {};
		const errors: string[] = [];
		const warnings: string[] = [];

		for (const [field, colIndex] of Object.entries(mapping)) {
			const rule = FIELD_RULES[field as ImportField];
			if (!rule) continue;

			const rawValue = row[colIndex] ?? "";
			const transformed = rule.transform
				? rule.transform(String(rawValue))
				: rawValue;
			data[field] = transformed;

			const error = rule.validate ? rule.validate(transformed) : null;
			if (error) {
				errors.push(`${field}: ${error}`);
			}
		}

		// Check required fields not in mapping
		for (const [field, rule] of Object.entries(FIELD_RULES)) {
			if (rule.required && !(field in data)) {
				errors.push(`${field}: هذا الحقل مطلوب ولم يتم ربطه بأي عمود`);
			}
		}

		// Duplicate detection
		let isDuplicate = false;
		const sku = String(data.sku || "").trim();
		const nameKey = normalizeArabic(String(data.name || "")).toLowerCase();

		if (sku && (existingSkus.has(sku) || seenSkus.has(sku))) {
			isDuplicate = true;
			warnings.push(`sku: الرمز "${sku}" مكرر`);
		}
		if (sku) seenSkus.add(sku);

		if (!sku && nameKey) {
			const composite = `${nameKey}:${data.price}`;
			if (seenNames.has(composite)) {
				isDuplicate = true;
				warnings.push(`name+price: منتج متطابق مكرر`);
			}
			seenNames.add(composite);
		}

		// Cost price warning if > price
		const price = Number(data.price || 0);
		const cost = Number(data.cost_price || 0);
		if (cost > price && cost > 0) {
			warnings.push("cost_price: سعر التكلفة أعلى من سعر البيع");
		}

		const isValid = errors.length === 0;

		validatedRows.push({
			index: i + 1,
			data,
			errors,
			warnings,
			isValid,
			isDuplicate,
		});
	}

	const validRows = validatedRows.filter((r) => r.isValid && !r.isDuplicate);
	const invalidRows = validatedRows.filter((r) => !r.isValid);
	const duplicateRows = validatedRows.filter((r) => r.isValid && r.isDuplicate);

	return {
		validRows,
		invalidRows,
		duplicateRows,
		summary: {
			total: rows.length,
			valid: validRows.length,
			invalid: invalidRows.length,
			duplicates: duplicateRows.length,
			willCreate: validRows.length,
			willSkip: invalidRows.length + duplicateRows.length,
		},
	};
}

export function autoMapColumns(headers: string[]): Partial<ColumnMapping> {
	const mapping: Partial<ColumnMapping> = {};

	const aliases: Record<string, string[]> = {
		name: [
			"name",
			"product",
			"product name",
			"nom",
			"المنتج",
			"اسم المنتج",
			"nom du produit",
			"designation",
			"libelle",
		],
		price: [
			"price",
			"sell price",
			"prix",
			"السعر",
			"prix vente",
			"selling price",
			"sale price",
			"prix unitaire",
		],
		cost_price: [
			"cost",
			"cost price",
			"prix de revient",
			"prix achat",
			"costprice",
			"buy price",
			"purchase price",
			"السعر الشراء",
		],
		stock: [
			"stock",
			"quantity",
			"qty",
			"quantité",
			"المخزون",
			"quantite",
			"inventory",
			"qte",
			"الكمية",
		],
		sku: [
			"sku",
			"reference",
			"ref",
			"code",
			"رقم",
			"reférence",
			"serial",
			"barcode",
			"sku code",
		],
		description: ["description", "desc", "details", "وصف", "detail"],
		category: [
			"category",
			"categorie",
			"catégorie",
			"الفئة",
			"type",
			"famille",
			"groupe",
			"department",
		],
	};

	for (let i = 0; i < headers.length; i++) {
		const header = headers[i].toLowerCase().trim();
		if (!header) continue;

		for (const [field, fieldAliases] of Object.entries(aliases)) {
			if (fieldAliases.includes(header)) {
				mapping[field] = i;
				break;
			}
			// Fuzzy: contains alias
			for (const alias of fieldAliases) {
				if (header.includes(alias)) {
					if (!(field in mapping)) {
						mapping[field] = i;
					}
					break;
				}
			}
		}
	}

	return mapping;
}

export function generateImportProducts(
	rows: ValidatedRow[],
	sellerId: string,
): Array<{
	seller_id: string;
	name: string;
	price: number;
	cost_price?: number | null;
	stock: number;
	sku?: string | null;
	description?: string | null;
	category?: string | null;
}> {
	return rows.map((r) => ({
		seller_id: sellerId,
		name: String(r.data.name || ""),
		price: Number(r.data.price || 0),
		cost_price:
			r.data.cost_price !== undefined
				? Number(r.data.cost_price) || null
				: null,
		stock: Number(r.data.stock ?? 0),
		sku: r.data.sku ? String(r.data.sku) : null,
		description: r.data.description ? String(r.data.description) : null,
		category: r.data.category ? String(r.data.category) : null,
	}));
}
