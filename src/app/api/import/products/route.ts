import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  parseFile,
  mapRows,
  validateRows,
  batchInsert,
  autoDetectMapping,
} from "@/lib/import/engine";
import { PRODUCT_FIELDS, parseNumber } from "@/lib/import/fields";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const productImportSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  price: z.number().int().min(0),
  cost: z.number().int().min(0).optional(),
  stock: z.number().int().min(0).optional(),
  category: z.string().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
});

/**
 * POST /api/import/products
 * Body (multipart): file=products.csv|xlsx, [commit=true|false], [mapping=JSON]
 *
 * If commit=false (default): parse + map + validate, return a preview.
 * If commit=true: insert the validated rows.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const { t } = await getI18n();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const commit = formData.get("commit") === "true";
  const mappingJson = formData.get("mapping") as string | null;

  if (!file) {
    return NextResponse.json({ error: t("import.missingFile") }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const parsed = parseFile(buffer, file.name);

  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: t("import.emptyFile") }, { status: 400 });
  }

  // Resolve the column mapping: explicit > auto-detect
  let mapping = parsed.headers.reduce<Record<string, string>>((acc, h) => {
    acc[h] = h;
    return acc;
  }, {});
  if (mappingJson) {
    try {
      mapping = JSON.parse(mappingJson) as Record<string, string>;
    } catch {
      /* fall back to auto-detect */
    }
  } else {
    mapping = autoDetectMapping(
      parsed.headers,
      PRODUCT_FIELDS.map((f) => ({ key: f.key, aliases: f.aliases })),
    );
  }

  // Map + coerce types (price/stock/cost → numbers)
  const mapped = mapRows(parsed.rows, mapping).map((r) => {
    const data = r.data as Record<string, string>;
    return {
      rowIndex: r.rowIndex,
      data: {
        name: data.name ?? "",
        sku: data.sku || undefined,
        price: parseNumber(data.price ?? "0"),
        cost: data.cost ? parseNumber(data.cost) : undefined,
        stock: data.stock ? parseNumber(data.stock) : undefined,
        category: data.category || undefined,
        lowStockThreshold: data.lowStockThreshold
          ? parseNumber(data.lowStockThreshold)
          : undefined,
      },
    };
  });

  const validation = validateRows(mapped, productImportSchema);

  if (!commit) {
    // Preview mode
    return NextResponse.json({
      totalRows: parsed.rows.length,
      headers: parsed.headers,
      mapping,
      validCount: validation.valid.length,
      invalidCount: validation.invalid.length,
      invalid: validation.invalid.slice(0, 20),
      preview: validation.valid.slice(0, 10).map((r) => r.data),
    });
  }

  // Commit mode — insert
  // Resolve categories (create if missing)
  const categoryNameToId = new Map<string, string>();
  for (const row of validation.valid) {
    const catName = (row.data as { category?: string }).category;
    if (catName && !categoryNameToId.has(catName)) {
      const existing = await db.category.findUnique({ where: { name: catName } });
      if (existing) {
        categoryNameToId.set(catName, existing.id);
      } else {
        const created = await db.category.create({ data: { name: catName } });
        categoryNameToId.set(catName, created.id);
      }
    }
  }

  const result = await batchInsert(validation.valid, async (chunk) => {
    let inserted = 0;
    const errors: Array<{ rowIndex: number; error: string }> = [];
    for (const row of chunk) {
      try {
        const { category, ...productData } = row.data as {
          category?: string;
          name: string;
          sku?: string;
          price: number;
          cost?: number;
          stock?: number;
          lowStockThreshold?: number;
        };
        await db.product.create({
          data: {
            ...productData,
            stock: productData.stock ?? 0,
            categoryId: category ? categoryNameToId.get(category) : undefined,
          },
        });
        inserted++;
      } catch (err) {
        errors.push({
          rowIndex: row.rowIndex,
          error: err instanceof Error ? err.message : t("common.errorGeneric"),
        });
      }
    }
    return { inserted, errors };
  });

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    errors: result.errors,
    totalRows: parsed.rows.length,
  });
}, "POST /api/import/products");
