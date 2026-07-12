import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { prepareSheetForExport, writeOrdersBatch } from "@/lib/integrations/google-sheets";

const ExportSchema = z.object({
  spreadsheetId: z.string().min(20, "Invalid spreadsheet ID"),
});

// W3-6: remove the 1000-order cap. Fetch all orders in batches of 500
// (Prisma skip/take pagination) and stream each batch into the sheet
// via prepareSheetForExport (once) + writeOrdersBatch (per DB batch).
// This keeps memory bounded — we never hold more than 500 orders in
// memory at a time — while still producing a single coherent export
// (clear-then-rewrite, no duplicates, no phantom tail).
const DB_BATCH_SIZE = 500;
// Safety cap: 200 batches × 500 = 100k orders. Above this a merchant
// should use the structured-data export (CSV/JSON) instead of syncing
// to Google Sheets. The cap exists so a runaway loop can't OOM the
// process or hit the Sheets API's per-day write quota.
const MAX_BATCHES = 200;

export const POST = withErrorHandler(async (req: Request) => {
  await requireAuth();
  const body = await req.json();
  const parsed = ExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid spreadsheet ID" },
      { status: 400 },
    );
  }

  // 1. W3-6: prepare the sheet ONCE — writes headers + clears any existing
  //    data range (so we don't append duplicates or leave stale rows).
  await prepareSheetForExport(parsed.data.spreadsheetId);

  // 2. Paginated DB fetch + streamed sheet write. Each batch is written
  //    at the row matching its global index (batch 0 → row 2, batch 1 →
  //    row 502, etc.) — never overlaps with the previous batch.
  //    AUDIT-2 A10 / Session 31: exclude soft-deleted orders.
  let exported = 0;
  let batchIndex = 0;
  let totalUpdatedRows = 0;

  for (; batchIndex < MAX_BATCHES; batchIndex++) {
    const batch = await db.order.findMany({
      where: { deletedAt: null },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
      skip: batchIndex * DB_BATCH_SIZE,
      take: DB_BATCH_SIZE,
    });

    if (batch.length === 0) {
      // No more orders — done.
      break;
    }

    const startRow = batchIndex * DB_BATCH_SIZE + 2; // row 1 = headers
    const result = await writeOrdersBatch(
      parsed.data.spreadsheetId,
      batch.map((o) => ({
        orderNumber: o.orderNumber,
        customerName: o.customer?.name ?? "",
        customerPhone: o.customer?.phone ?? "",
        wilaya: o.wilaya ?? "",
        commune: o.commune ?? "",
        totalPrice: o.totalPrice,
        status: o.status,
        createdAt: o.createdAt,
      })),
      startRow,
    );
    exported += batch.length;
    totalUpdatedRows += result.updatedRows;

    // If the batch was smaller than DB_BATCH_SIZE, this was the last page.
    if (batch.length < DB_BATCH_SIZE) {
      break;
    }
  }

  if (batchIndex >= MAX_BATCHES) {
    // We hit the safety cap — surface a partial-result warning so the
    // caller knows the export was truncated (rather than silently
    // succeeding with a misleading "exported N orders" count).
    return NextResponse.json({
      success: true,
      exported,
      updatedRows: totalUpdatedRows,
      truncated: true,
      message: `Export capped at ${MAX_BATCHES * DB_BATCH_SIZE} orders (safety limit). Use CSV/JSON export for larger datasets.`,
    });
  }

  return NextResponse.json({
    success: true,
    exported,
    updatedRows: totalUpdatedRows,
  });
}, "POST /api/integrations/google-sheets/export");
