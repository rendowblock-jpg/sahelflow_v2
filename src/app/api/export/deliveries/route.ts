import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/import/export";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** GET /api/export/deliveries?format=csv|xlsx */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  void logAudit({ action: "export.deliveries", entity: "deliveries", actor: "user", after: { format: req.nextUrl.searchParams.get("format") ?? "csv" } });
  const { t, locale } = await getI18n();
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  const deliveries = await db.delivery.findMany({
    where: { deletedAt: null },
    include: { order: { include: { customer: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  const rows = deliveries.map((d) => ({
    trackingNumber: d.trackingNumber ?? "",
    provider: d.provider,
    orderNumber: d.order.orderNumber,
    customerName: d.order.customer?.name ?? "",
    phone: d.order.phone,
    wilaya: d.order.wilaya,
    commune: d.order.commune,
    status: t(`deliveries.status.${d.status}`),
    cost: d.cost ?? 0,
    createdAt: new Date(d.createdAt).toLocaleString(localeTag),
  }));

  const columns = [
    { key: "trackingNumber", label: t("export.deliveries.tracking") },
    { key: "provider", label: t("export.deliveries.provider") },
    { key: "orderNumber", label: t("export.deliveries.orderNumber") },
    { key: "customerName", label: t("export.deliveries.customer") },
    { key: "phone", label: t("export.deliveries.phone") },
    { key: "wilaya", label: t("export.deliveries.wilaya") },
    { key: "commune", label: t("export.deliveries.commune") },
    { key: "status", label: t("export.deliveries.status") },
    { key: "cost", label: t("export.deliveries.cost") },
    { key: "createdAt", label: t("export.deliveries.date") },
  ];

  const filePrefix = locale === "ar" ? "توصيلات" : locale === "fr" ? "livraisons" : "deliveries";
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
}, "GET /api/export/deliveries");
