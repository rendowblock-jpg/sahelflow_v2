import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  parseFile,
  mapRows,
  validateRows,
  autoDetectMapping,
} from "@/lib/import/engine";
import { ORDER_FIELDS, parseNumber, normalizePhone } from "@/lib/import/fields";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";
import { nextOrderNumber } from "@/lib/data/service-base";

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
  status: z.string().optional(),
  orderNumber: z.string().optional(),
});

/** POST /api/import/orders */
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

  let mapping: Record<string, string>;
  if (mappingJson) {
    mapping = JSON.parse(mappingJson) as Record<string, string>;
  } else {
    mapping = autoDetectMapping(
      parsed.headers,
      ORDER_FIELDS.map((f) => ({ key: f.key, aliases: f.aliases })),
    );
  }

  const mapped = mapRows<{ customerName: string; phone: string; wilaya: string; commune?: string; address?: string; productName: string; quantity: number; unitPrice: number; deliveryCost?: number; status?: string; orderNumber?: string }>(parsed.rows, mapping);
  const normalized = mapped.map((m) => {
    const row = m.data;
    return {
      rowIndex: m.rowIndex,
      data: {
        ...row,
        quantity: parseNumber(String(row.quantity ?? "1")),
        unitPrice: parseNumber(String(row.unitPrice ?? "0")),
        deliveryCost: parseNumber(String(row.deliveryCost ?? "0")),
        phone: normalizePhone(String(row.phone ?? "")),
      },
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
    });
  }

  // Insert orders — for each row, find or create the customer, then create the order
  let inserted = 0;
  const errors: Array<{ rowIndex: number; error: string }> = [];

  for (const validRow of validation.valid) {
    try {
      const data = validRow.data as { customerName: string; phone: string; wilaya: string; commune?: string; address?: string; productName: string; quantity: number; unitPrice: number; deliveryCost?: number; status?: string; orderNumber?: string };
      const phone = data.phone;

      // Find or create customer
      let customer = await db.customer.findUnique({ where: { phone } });
      if (!customer) {
        customer = await db.customer.create({
          data: {
            name: data.customerName,
            phone,
            wilaya: data.wilaya,
            commune: data.commune ?? null,
            address: data.address ?? null,
          },
        });
      }

      const itemsTotal = data.unitPrice * data.quantity;
      const deliveryCost = data.deliveryCost ?? 0;
      const totalPrice = itemsTotal + deliveryCost;
      const orderNumber = data.orderNumber ?? await nextOrderNumber(db);

      await db.order.create({
        data: {
          orderNumber,
          status: (data.status as string) || "pending",
          customerId: customer.id,
          wilaya: data.wilaya,
          commune: data.commune ?? "",
          address: data.address ?? "",
          phone,
          totalPrice,
          deliveryCost,
          source: "manual",
          items: {
            create: [{
              productName: data.productName,
              quantity: data.quantity,
              unitPrice: data.unitPrice,
              total: itemsTotal,
            }],
          },
        },
      });
      inserted++;
    } catch (err) {
      errors.push({
        rowIndex: validRow.rowIndex,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ inserted, errors });
}, "POST /api/import/orders");
