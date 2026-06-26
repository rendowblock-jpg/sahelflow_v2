import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/import/export";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** GET /api/export/returns?format=csv|xlsx */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { t, locale } = await getI18n();
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  const returns = await db.return.findMany({
    include: { order: { include: { customer: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  const rows = returns.map((r) => ({
    orderNumber: r.order.orderNumber,
    customerName: r.order.customer?.name ?? "",
    type: t(`returns.type.${r.type}`),
    status: t(`returns.status.${r.status}`),
    reason: r.reason,
    createdAt: new Date(r.createdAt).toLocaleString(localeTag),
  }));

  const columns = [
    { key: "orderNumber", label: t("export.returns.orderNumber") },
    { key: "customerName", label: t("export.returns.customer") },
    { key: "type", label: t("export.returns.type") },
    { key: "status", label: t("export.returns.status") },
    { key: "reason", label: t("export.returns.reason") },
    { key: "createdAt", label: t("export.returns.date") },
  ];

  const filePrefix = locale === "ar" ? "إرجاعات" : locale === "fr" ? "retours" : "returns";
  const fileSuffix = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buf = toXlsx(rows, columns);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.xlsx"`,
      },
    });
  }

  const csv = toCsv(rows, columns);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.csv"`,
    },
  });
}, "GET /api/export/returns");
