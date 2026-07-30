import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { orderService } from "@/lib/data/order-service";
import { db, shopContext } from "@/lib/db";
import {
  autoDetectMapping,
  mapRows,
  parseFile,
  validateRows,
} from "@/lib/import/engine";
import {
  normalizePhone,
  ORDER_FIELDS,
  parseNumber,
} from "@/lib/import/fields";
import { getI18n } from "@/lib/i18n-server";
import { orderStatusSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const orderImportSchema = z.object({
  customerName: z.string().min(1),
  phone: z.string().min(1),
  wilaya: z.string().min(1),
  commune: z.string().optional(),
  address: z.string().optional(),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  deliveryCost: z.number().int().nonnegative().optional(),
  status: orderStatusSchema.optional(),
  orderNumber: z.string().optional(),
});

type ImportRow = z.infer<typeof orderImportSchema>;

/** POST /api/import/orders */
export const POST = withErrorHandler(async (request: NextRequest) => {
  await requireAuth();
  const { t } = await getI18n();
  const formData = await request.formData();
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

  const mapping = mappingJson
    ? (JSON.parse(mappingJson) as Record<string, string>)
    : autoDetectMapping(
        parsed.headers,
        ORDER_FIELDS.map((field) => ({
          key: field.key,
          aliases: field.aliases,
        })),
      );

  const mapped = mapRows<ImportRow>(parsed.rows, mapping);
  const normalized: Array<{
    rowIndex: number;
    data: Partial<ImportRow>;
  }> = mapped.map((entry) => {
    const rawStatus = entry.data.status
      ? String(entry.data.status).trim().toLowerCase()
      : undefined;
    const rawOrderNumber = String(entry.data.orderNumber ?? "").trim();
    return {
      rowIndex: entry.rowIndex,
      data: {
        ...entry.data,
        quantity: parseNumber(String(entry.data.quantity ?? "1")),
        unitPrice: parseNumber(String(entry.data.unitPrice ?? "0")),
        deliveryCost: parseNumber(String(entry.data.deliveryCost ?? "0")),
        phone: normalizePhone(String(entry.data.phone ?? "")),
        status: rawStatus,
        orderNumber: rawOrderNumber || undefined,
      } as Partial<ImportRow>,
    };
  });
  const validation = validateRows(normalized, orderImportSchema);

  if (!commit) {
    return NextResponse.json({
      preview: validation.valid.slice(0, 10),
      totalCount: parsed.rows.length,
      validCount: validation.valid.length,
      invalidCount: validation.invalid.length,
      errors: validation.invalid.slice(0, 10),
      mapping,
      authorityNotice:
        "Imported rows remain explicit compatibility records. Valid lifecycle states are preserved, and pending imports use the legacy confirmation path until exact catalog mapping is available.",
    });
  }

  const context = { prisma: db, shop: shopContext };
  let inserted = 0;
  const errors: Array<{ rowIndex: number; error: string }> = [];

  for (const validRow of validation.valid) {
    try {
      const afterCommit: Array<() => void> = [];
      await context.prisma.$transaction(async (tx) => {
        const data = validRow.data;
        const phone = data.phone;
        let customer = await tx.customer.findUnique({ where: { phone } });
        if (!customer) {
          customer = await tx.customer.create({
            data: {
              name: data.customerName,
              phone,
              wilaya: data.wilaya,
              commune: data.commune ?? null,
              address: data.address ?? null,
            },
          });
        }

        const deliveryCost = data.deliveryCost ?? 0;
        const sourceOrderId = data.orderNumber?.trim() || null;
        await orderService.create(
          context,
          {
            customerId: customer.id,
            items: [
              {
                productName: data.productName,
                quantity: data.quantity,
                unitPrice: data.unitPrice,
              },
            ],
            wilaya: data.wilaya,
            commune: data.commune ?? "",
            address: data.address ?? "",
            phone,
            source: "import",
            sourceOrderId,
            sourceMetadata: {
              authority: "legacy-import-compatibility",
              originalOrderNumber: sourceOrderId,
            },
            deliveryCost: deliveryCost > 0 ? deliveryCost : null,
            status: data.status ?? "pending",
          },
          {
            tx: tx as never,
            afterCommit: (effect) => afterCommit.push(effect),
          },
        );
      });
      afterCommit.forEach((effect) => effect());
      inserted += 1;
    } catch (error) {
      errors.push({
        rowIndex: validRow.rowIndex,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ inserted, errors });
}, "POST /api/import/orders");
