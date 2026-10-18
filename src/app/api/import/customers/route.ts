import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { customerService } from "@/lib/data";
import {
  MAX_IMPORT_FILE_BYTES,
  parseFile,
  mapRows,
  validateRows,
  batchInsert,
  autoDetectMapping,
} from "@/lib/import/engine";
import { CUSTOMER_FIELDS, normalizePhone } from "@/lib/import/fields";
import { importAuditAfter } from "@/lib/import/import-audit";
import { importRowError } from "@/lib/import/row-error";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { getI18n } from "@/lib/i18n-server";
import { requireAuth } from "@/lib/auth/server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { logger } from "@/lib/logger";
import { createCustomerSchema } from "@/lib/validation";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

/**
 * Preview and commit validate with the SAME schema the customer API and the
 * service use (S03c-13). The preview used to check only "name and phone are
 * non-empty", so it reported rows as valid that the commit then rejected.
 */

/** POST /api/import/customers — preview (commit=false) or canonical insert. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
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
  // Import bounds (audit 7-a F4): reject oversized uploads before reading.
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new SahelFlowError(t("import.fileTooLarge"), "IMPORT_FILE_TOO_LARGE", 413);
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
  const validation = validateRows(mapped, createCustomerSchema);

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
    const errors: Array<{ rowIndex: number; error: string; code: string }> = [];
    for (const row of chunk) {
      try {
        await customerService.create(context, row.data);
        inserted += 1;
      } catch (error) {
        // Constant per-row message: never echo driver text or the phone number.
        const coded = importRowError(error);
        logger.warn("api.POST /api/import/customers.row-failed", {
          rowIndex: row.rowIndex,
          code: coded.code,
        });
        errors.push({ rowIndex: row.rowIndex, error: coded.message, code: coded.code });
      }
    }
    return { inserted, errors };
  });

  await logAudit(context, {
    action: "import.customers",
    entity: "customers",
    actor: trustedActorAuditIdentity(actorContext.actor),
    after: importAuditAfter({
      entity: "customers",
      totalRows: parsed.rows.length,
      inserted: result.inserted,
      failed: result.errors.length,
      invalid: validation.invalid.length,
      mapping,
      knownFields: CUSTOMER_FIELDS.map((field) => field.key),
    }),
  });

  return NextResponse.json({
    ok: true,
    inserted: result.inserted,
    errors: result.errors,
    totalRows: parsed.rows.length,
  });
}, "POST /api/import/customers");
