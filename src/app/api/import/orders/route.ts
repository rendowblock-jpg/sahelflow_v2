import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  dispatchTrigger,
  type TriggerEvent,
} from "@/lib/automations/engine";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  autoDetectMapping,
  mapRows,
  parseFile,
  validateRows,
} from "@/lib/import/engine";
import { ORDER_FIELDS, parseNumber } from "@/lib/import/fields";
import { assertTrustedAction } from "@/lib/identity/authorization";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import {
  canonicalImportRowSchema,
  prepareCanonicalFileImport,
  type CanonicalFileSource,
  type CanonicalImportRow,
} from "@/lib/orders/canonical-file-import";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";

export const dynamic = "force-dynamic";

function sourceForFilename(filename: string): CanonicalFileSource {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "csv" || extension === "txt") return "csv";
  if (extension === "xlsx" || extension === "xls") return "xlsx";
  throw new Error("Unsupported order import file; use CSV or XLSX");
}

function optionalNumber(value: unknown): number | undefined {
  const text = String(value ?? "").trim();
  return text ? parseNumber(text) : undefined;
}

function normalizedRows(
  rows: Array<{ rowIndex: number; data: Partial<CanonicalImportRow> }>,
): Array<{ rowIndex: number; data: Partial<CanonicalImportRow> }> {
  return rows.map((row) => ({
    rowIndex: row.rowIndex,
    data: {
      ...row.data,
      orderNumber: String(row.data.orderNumber ?? "").trim() || undefined,
      customerName: String(row.data.customerName ?? "").trim(),
      phone: String(row.data.phone ?? "").trim(),
      wilaya: String(row.data.wilaya ?? "").trim(),
      commune: String(row.data.commune ?? "").trim() || undefined,
      address: String(row.data.address ?? "").trim() || undefined,
      productName: String(row.data.productName ?? "").trim() || undefined,
      productSku: String(row.data.productSku ?? "").trim() || undefined,
      variantName: String(row.data.variantName ?? "").trim() || undefined,
      variantSku: String(row.data.variantSku ?? "").trim() || undefined,
      quantity: parseNumber(String(row.data.quantity ?? "1")),
      unitPrice: optionalNumber(row.data.unitPrice),
      deliveryCost: optionalNumber(row.data.deliveryCost) ?? 0,
      status: String(row.data.status ?? "").trim() || undefined,
    },
  }));
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedActor();
  for (const action of [
    "data.import",
    "orders.create",
    "customers.contact.read",
    "customers.contact.update",
    "orders.financials.read",
    "orders.financials.update",
  ] as const) {
    assertTrustedAction(actorContext, action);
  }
  const formData = await request.formData();
  const file = formData.get("file");
  const commit = formData.get("commit") === "true";
  const mappingJson = formData.get("mapping");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing import file" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const source = sourceForFilename(file.name);
  const fileHash = createHash("sha256")
    .update(Buffer.from(buffer))
    .digest("hex");
  const parsed = parseFile(buffer, file.name);
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: "The import file is empty" }, { status: 400 });
  }

  const mapping =
    typeof mappingJson === "string" && mappingJson.trim()
      ? (JSON.parse(mappingJson) as Record<string, string>)
      : autoDetectMapping(
          parsed.headers,
          ORDER_FIELDS.map((field) => ({
            key: field.key,
            aliases: field.aliases,
          })),
        );
  const mapped = normalizedRows(
    mapRows<CanonicalImportRow>(parsed.rows, mapping),
  );
  const structural = validateRows(mapped, canonicalImportRowSchema);
  const prepared = await prepareCanonicalFileImport(
    { prisma: db },
    {
      source,
      fileHash,
      rows: structural.valid,
      structuralInvalid: structural.invalid,
    },
  );
  const invalidRows = new Set(prepared.invalid.map((failure) => failure.rowIndex));
  const validRowCount = parsed.rows.length - invalidRows.size;

  if (!commit) {
    return NextResponse.json({
      preview: prepared.preview.slice(0, 20),
      totalCount: parsed.rows.length,
      totalRows: parsed.rows.length,
      validCount: validRowCount,
      validOrderCount: prepared.groups.length,
      invalidCount: invalidRows.size,
      errors: prepared.invalid.slice(0, 50),
      invalid: prepared.invalid.slice(0, 50),
      mapping,
      fileHash,
      source,
    });
  }

  let inserted = 0;
  let replayed = 0;
  let processedRows = 0;
  const errors: Array<{ rowIndex: number; error: string }> = [
    ...prepared.invalid.map((failure) => ({
      rowIndex: failure.rowIndex,
      error: failure.errors.join(", "),
    })),
  ];
  const commandContext = {
    prisma: db,
    shop: actorContext.shop,
    businessPrincipal: businessPrincipalFromTrustedActor(actorContext),
  };

  for (const group of prepared.groups) {
    try {
      const command = await createCanonicalSourceOrder(commandContext, {
        idempotencyKey: `import:${source}:${group.sourceOrderId}`,
        correlationId: `import:${fileHash.slice(0, 24)}:${group.sourceOrderId}`,
        source,
        sourceIdentity: prepared.sourceIdentity,
        sourceOrderId: group.sourceOrderId,
        newCustomer: group.customer,
        items: group.items,
        wilaya: group.customer.wilaya,
        commune: group.customer.commune,
        address: group.customer.address,
        phone: group.customer.phone,
        deliveryCost: group.deliveryCost,
        notes: `Imported from ${file.name}; source group ${group.groupKey}`,
      });
      processedRows += group.rowIndices.length;
      if (command.replayed) {
        replayed += 1;
      } else {
        inserted += 1;
        await dispatchTrigger(
          { prisma: db, shop: actorContext.shop },
          "order.created" as TriggerEvent,
          command.result.automation,
          {
            triggerKey: `order.created:${command.result.order.id}`,
            occurredAt: command.result.order.createdAt,
          },
        );
      }
    } catch (error) {
      errors.push({
        rowIndex: group.rowIndices[0] ?? 0,
        error: error instanceof Error ? error.message : "Order import failed",
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    inserted,
    replayed,
    processedRows,
    validOrderCount: prepared.groups.length,
    invalidCount: invalidRows.size,
    errors,
    totalRows: parsed.rows.length,
    fileHash,
    source,
  });
}, "POST /api/import/orders");
