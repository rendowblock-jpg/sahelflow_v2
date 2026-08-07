import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { toXlsx } from "@/lib/import/export";
import {
  collectBoundedXlsxRows,
  createPagedCsvStream,
} from "@/lib/import/paged-export";
import { getI18n } from "@/lib/i18n-server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

type OrderExportRow = Record<string, unknown> & {
  orderNumber: string;
  status: string;
  customerName: string;
  phone: string;
  wilaya: string;
  commune: string;
  totalPrice: number;
  deliveryCost: number;
  source: string;
  createdAt: string;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
    "data.export",
    "orders.read",
    "customers.contact.read",
    "orders.financials.read",
  ]);
  const { t, locale } = await getI18n();
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "export.orders",
      entity: "orders",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { format },
    },
  );

  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  const columns = [
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
  ] as const;
  const loadPage = async (take: number, skip: number): Promise<OrderExportRow[]> => {
    const orders = await db.order.findMany({
      where: { deletedAt: null },
      select: {
        orderNumber: true,
        status: true,
        phone: true,
        wilaya: true,
        commune: true,
        totalPrice: true,
        deliveryCost: true,
        source: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    });
    return orders.map((order) => ({
      orderNumber: order.orderNumber,
      status: t(`orders.status.${order.status}`),
      customerName: order.customer.name,
      phone: order.phone,
      wilaya: order.wilaya,
      commune: order.commune,
      totalPrice: order.totalPrice,
      deliveryCost: order.deliveryCost ?? 0,
      source: order.source,
      createdAt: order.createdAt.toLocaleString(localeTag),
    }));
  };

  const filePrefix = locale === "ar" ? "طلبات" : locale === "fr" ? "commandes" : "orders";
  const fileSuffix = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const total = await db.order.count({ where: { deletedAt: null } });
    const rows = await collectBoundedXlsxRows(total, loadPage);
    return new NextResponse(toXlsx(rows, [...columns]), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.xlsx"`,
      },
    });
  }

  return new NextResponse(createPagedCsvStream(columns, loadPage), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}, "GET /api/export/orders");
