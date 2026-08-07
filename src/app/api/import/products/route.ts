import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { productService } from "@/lib/data";
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
import { requireAuth } from "@/lib/auth/server";

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

/** POST /api/import/products — preview (commit=false) or canonical insert. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth([
    "data.import",
    "products.manage",
    "products.cost.read",
    "products.cost.update",
  ]);
  const { t } = await getI18n();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const commit = formData.get("commit") === "true";
  const mappingJson = formData.get("mapping") as string | null;

  if (!file) {
    return NextResponse.json({ error: t("import.missingFile") }, { status: 400 });
  }

  const parsed = parseFile(await file.arrayBuffer(), file.name);
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: t("import.emptyFile") }, { status: 400 });
  }

  let mapping = parsed.headers.reduce<Record<string, string>>((acc, header) => {
    acc[header] = header;
    return acc;
  }, {});
  if (mappingJson) {
    try {
      mapping = JSON.parse(mappingJson) as Record<string, string>;
    } catch {
      mapping = autoDetectMapping(
        parsed.headers,
        PRODUCT_FIELDS.map((field) => ({ key: field.key, aliases: field.aliases })),
      );
    }
  } else {
    mapping = autoDetectMapping(
      parsed.headers,
      PRODUCT_FIELDS.map((field) => ({ key: field.key, aliases: field.aliases })),
    );
  }

  const mapped = mapRows(parsed.rows, mapping).map((row) => {
    const data = row.data as Record<string, string>;
    return {
      rowIndex: row.rowIndex,
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
    return NextResponse.json({
      totalRows: parsed.rows.length,
      headers: parsed.headers,
      mapping,
      validCount: validation.valid.length,
      invalidCount: validation.invalid.length,
      invalid: validation.invalid.slice(0, 20),
      preview: validation.valid.slice(0, 10).map((row) => row.data),
    });
  }

  const context = { prisma: db, shop: shopContext };
  const categoryNameToId = new Map<string, string>();
  for (const row of validation.valid) {
    const categoryName = (row.data as { category?: string }).category;
    if (!categoryName || categoryNameToId.has(categoryName)) continue;
    const existing = await db.category.findUnique({ where: { name: categoryName } });
    const category = existing ?? await productService.createCategory(context, { name: categoryName });
    categoryNameToId.set(categoryName, category.id);
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
        await productService.create(context, {
          ...productData,
          stock: productData.stock ?? 0,
          categoryId: category ? categoryNameToId.get(category) : undefined,
        });
        inserted += 1;
      } catch (error) {
        errors.push({
          rowIndex: row.rowIndex,
          error: error instanceof Error ? error.message : t("common.errorGeneric"),
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
