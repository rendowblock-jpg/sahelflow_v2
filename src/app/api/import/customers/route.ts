import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { customerService } from "@/lib/data";
import {
  parseFile,
  mapRows,
  validateRows,
  batchInsert,
  autoDetectMapping,
} from "@/lib/import/engine";
import { CUSTOMER_FIELDS, normalizePhone } from "@/lib/import/fields";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const customerImportSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  phone2: z.string().optional(),
  wilaya: z.string().optional(),
  commune: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

/** POST /api/import/customers — preview (commit=false) or canonical insert. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth([
    "data.import",
    "customers.manage",
    "customers.contact.read",
    "customers.contact.update",
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
      // Invalid explicit mapping falls back to auto-detection below.
      mapping = autoDetectMapping(
        parsed.headers,
        CUSTOMER_FIELDS.map((field) => ({ key: field.key, aliases: field.aliases })),
      );
    }
  } else {
    mapping = autoDetectMapping(
      parsed.headers,
      CUSTOMER_FIELDS.map((field) => ({ key: field.key, aliases: field.aliases })),
    );
  }

  const mapped = mapRows(parsed.rows, mapping).map((row) => {
    const data = row.data as Record<string, string>;
    return {
      rowIndex: row.rowIndex,
      data: {
        name: data.name ?? "",
        phone: normalizePhone(data.phone ?? ""),
        phone2: data.phone2 ? normalizePhone(data.phone2) : undefined,
        wilaya: data.wilaya || undefined,
        commune: data.commune || undefined,
        address: data.address || undefined,
        notes: data.notes || undefined,
      },
    };
  });
  const validation = validateRows(mapped, customerImportSchema);

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
  const result = await batchInsert(validation.valid, async (chunk) => {
    let inserted = 0;
    const errors: Array<{ rowIndex: number; error: string }> = [];
    for (const row of chunk) {
      try {
        await customerService.create(context, row.data);
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
}, "POST /api/import/customers");
