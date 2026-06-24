import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { exportOrdersToSheet } from "@/lib/integrations/google-sheets";

const ExportSchema = z.object({
  spreadsheetId: z.string().min(20, "Invalid spreadsheet ID"),
});

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

  // Fetch all orders with customer info
  const orders = await db.order.findMany({
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const result = await exportOrdersToSheet(parsed.data.spreadsheetId, orders.map((o) => ({
    orderNumber: o.orderNumber,
    customerName: o.customer?.name ?? "",
    customerPhone: o.customer?.phone ?? "",
    wilaya: o.wilaya ?? "",
    commune: o.commune ?? "",
    totalPrice: o.totalPrice,
    status: o.status,
    createdAt: o.createdAt,
  })));

  return NextResponse.json({
    success: true,
    exported: orders.length,
    updatedRows: result.updatedRows,
  });
}, "POST /api/integrations/google-sheets/export");
