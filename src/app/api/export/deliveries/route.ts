import { NextRequest, NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { toCsv, toXlsx } from "@/lib/import/export";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/export/deliveries?format=csv|xlsx */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
    "data.export",
    "deliveries.read",
    "customers.contact.read",
    "orders.financials.read",
  ]);
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "export.deliveries",
    entity: "deliveries",
    actor: trustedActorAuditIdentity(actorContext.actor),
    after: { format },
  });
  const { t, locale } = await getI18n();
  const deliveries = await db.delivery.findMany({
    where: { deletedAt: null },
    select: {
      trackingNumber: true,
      provider: true,
      status: true,
      cost: true,
      createdAt: true,
      order: {
        select: {
          orderNumber: true,
          phone: true,
          wilaya: true,
          commune: true,
          customer: { select: { name: true } },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  const rows = deliveries.map((delivery) => ({
    trackingNumber: delivery.trackingNumber ?? "",
    provider: delivery.provider,
    orderNumber: delivery.order.orderNumber,
    customerName: delivery.order.customer?.name ?? "",
    phone: delivery.order.phone,
    wilaya: delivery.order.wilaya,
    commune: delivery.order.commune,
    status: t(`deliveries.status.${delivery.status}`),
    cost: delivery.cost ?? 0,
    createdAt: new Date(delivery.createdAt).toLocaleString(localeTag),
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
    return new NextResponse(toXlsx(rows, columns), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.xlsx"`,
      },
    });
  }
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.csv"`,
    },
  });
}, "GET /api/export/deliveries");
