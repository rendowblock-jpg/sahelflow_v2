import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/import/export";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** GET /api/export/orders?format=csv|xlsx — download all orders. */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const { t, locale } = await getI18n();
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const orders = await db.order.findMany({
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  const rows = orders.map((o) => ({
    orderNumber: o.orderNumber,
    status: t(`orders.status.${o.status}`),
    customerName: o.customer.name,
    phone: o.phone,
    wilaya: o.wilaya,
    commune: o.commune,
    totalPrice: o.totalPrice,
    deliveryCost: o.deliveryCost ?? 0,
    source: o.source,
    createdAt: new Date(o.createdAt).toLocaleString(localeTag),
  }));

  const csv = toCsv(rows, [
    { key: "orderNumber", label: t("export.orders.orderNumber") },
    { key: "status", label: t("export.orders.status") },
    { key: "customerName", label: t("export.orders.customer") },
    { key: "phone", label: t("export.orders.phone") },
    { key: "wilaya", label: t("export.orders.wilaya") },
    { key: "commune", label: t("export.orders.commune") },
    { key: "totalPrice", label: t("export.orders.total") },
    { key: "deliveryCost", label: t("export.orders.deliveryCost") },
    { key: "source", label: t("export.orders.source") },
    { key: "createdAt", label: t("export.orders.date") },
  ]);

  const filePrefix = locale === "ar" ? "طلبات" : locale === "fr" ? "commandes" : "orders";
  const fileSuffix = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const xlsxBuffer = toXlsx(rows, [
      { key: "orderNumber", label: t("export.orders.orderNumber") },
      { key: "status", label: t("export.orders.status") },
      { key: "customerName", label: t("export.orders.customer") },
      { key: "phone", label: t("export.orders.phone") },
      { key: "wilaya", label: t("export.orders.wilaya") },
      { key: "commune", label: t("export.orders.commune") },
      { key: "totalPrice", label: t("export.orders.total") },
      { key: "deliveryCost", label: t("export.orders.deliveryCost") },
      { key: "source", label: t("export.orders.source") },
      { key: "createdAt", label: t("export.orders.date") },
    ]);
    return new NextResponse(xlsxBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.xlsx"`,
      },
    });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.csv"`,
    },
  });
}, "GET /api/export/orders");
