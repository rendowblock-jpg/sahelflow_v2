import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { orderStatusSchema } from "@/lib/validation";
import { db, shopContext } from "@/lib/db";
import {
  parseFile,
  mapRows,
  validateRows,
  autoDetectMapping,
} from "@/lib/import/engine";
import { ORDER_FIELDS, parseNumber, normalizePhone } from "@/lib/import/fields";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";
import { orderService } from "@/lib/data/order-service";
import { requireAuth } from "@/lib/auth/server";

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
  const context = { prisma: db, shop: shopContext };
  let inserted = 0;
  const errors: Array<{ rowIndex: number; error: string }> = [];

  for (const validRow of validation.valid) {
    try {
      // A-H4: wrap each row's customer-find-or-create + order-create in a
      // per-row $transaction. Previously a failed order.create (after
      // nextOrderNumber already incremented the counter) left gaps in
      // order numbering + a partial customer create. Now each row is atomic.
      const afterCommit: Array<() => void> = [];
      await context.prisma.$transaction(async (tx) => {
        const data = validRow.data as { customerName: string; phone: string; wilaya: string; commune?: string; address?: string; productName: string; quantity: number; unitPrice: number; deliveryCost?: number; status?: string; orderNumber?: string };
        const phone = data.phone;

        // Find or create customer (inside tx)
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
        const parsedStatus = orderStatusSchema.safeParse(data.status);
        const status = parsedStatus.success ? parsedStatus.data : "pending";

        // Phase 1 bug 1.3: route through orderService.create so imported
        // orders get the OrderChange "created" ledger entry + the
        // `order.created` automation trigger (same as manual UI orders). The
        // service runs inside this per-row tx (opts.tx) so customer-find-or-
        // create + order-create + ledger entry stay atomic.
        //
        // Note: the import path allows user-specified status (default
        // "pending" — historical imports). createOrderSchema was extended to
        // accept an optional `status` field for this purpose.
        //
        // Note: data.orderNumber (if provided) is currently ignored — the
        // service generates its own order number atomically via nextOrderNumber.
        // Acceptable trade-off: imported orders get SahelFlow order numbers,
        // preserving the sequential counter invariant.
        await orderService.create(
          { prisma: db, shop: shopContext },
          {
            customerId: customer.id,
            items: [{
              productName: data.productName,
              quantity: data.quantity,
              unitPrice: data.unitPrice,
            }],
            wilaya: data.wilaya,
            commune: data.commune ?? "",
            address: data.address ?? "",
            phone,
            source: "manual",
            deliveryCost: deliveryCost > 0 ? deliveryCost : null,
            status,
          },
          {
            tx: tx as never,
            afterCommit: (effect) => afterCommit.push(effect),
          },
        );
      });
      afterCommit.forEach((effect) => effect());
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
