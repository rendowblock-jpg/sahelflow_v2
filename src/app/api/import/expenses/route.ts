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
import { EXPENSE_FIELDS, parseNumber } from "@/lib/import/fields";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const expenseImportSchema = z.object({
  date: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().int().positive(),
});

const VALID_CATEGORIES = ["shipping", "advertising", "supplies", "salary", "rent", "utilities", "other"];

/** POST /api/import/expenses */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
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

  let mapping: Record<string, string>;
  if (mappingJson) {
    mapping = JSON.parse(mappingJson) as Record<string, string>;
  } else {
    mapping = autoDetectMapping(
      parsed.headers,
      EXPENSE_FIELDS.map((f) => ({ key: f.key, aliases: f.aliases })),
    );
  }

  const mapped = mapRows(parsed.rows, mapping);
  const normalized = mapped.map((m) => {
    const row = m.data as Record<string, string>;
    return {
      rowIndex: m.rowIndex,
      data: {
        date: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
        category: VALID_CATEGORIES.includes(String(row.category ?? "").toLowerCase())
          ? String(row.category).toLowerCase()
          : "other",
        description: row.description ?? "",
        amount: parseNumber(String(row.amount ?? "0")),
      },
    };
  });

  const validation = validateRows(normalized, expenseImportSchema);

  if (!commit) {
    return NextResponse.json({
      preview: validation.valid.slice(0, 10),
      totalCount: parsed.rows.length,
      validCount: validation.valid.length,
      invalidCount: validation.invalid.length,
      errors: validation.invalid.slice(0, 10),
      mapping,
    });
  }

  const result = await batchInsert(validation.valid, async (batch) => {
    await db.expense.createMany({
      data: batch.map((row) => {
        const data = row.data as { date: string; category: string; description?: string; amount: number };
        return {
          date: new Date(data.date),
          category: data.category,
          notes: data.description ?? null,
          amount: data.amount,
        };
      }),
    });
    return { inserted: batch.length };
  });

  return NextResponse.json({
    inserted: result.inserted,
    errors: result.errors,
  });
}, "POST /api/import/expenses");
