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
import {
  buildOrdersWorkbenchWhere,
  ordersWorkbenchOrderBy,
  resolveOrdersWorkbenchAccess,
  type OrdersWorkbenchFilters,
} from "@/lib/orders/order-list-workbench";
import { orderStatusSchema } from "@/lib/validation";
import type { OrderStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

/** Filtered exports are capped so a scoped download stays an interactive action. */
const MAX_FILTERED_EXPORT_ROWS = 5_000;

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
  const searchParams = req.nextUrl.searchParams;
  const format = searchParams.get("format") ?? "csv";

  // Filtered export: mirror the operational list contract (q / wilaya / date
  // range / status / sort) so the downloaded file is the view the seller sees.
  const rawStatus = searchParams.get("status");
  const status =
    rawStatus && orderStatusSchema.safeParse(rawStatus).success
      ? (rawStatus as OrderStatus)
      : undefined;
  const wilayaCode = Number.parseInt(searchParams.get("wilaya") ?? "", 10);
  const filters: OrdersWorkbenchFilters = {
    status,
    q: searchParams.get("q") ?? undefined,
    wilayaCode: Number.isSafeInteger(wilayaCode) ? wilayaCode : undefined,
    dateFrom:
      searchParams.get("dateFrom") ?? searchParams.get("from") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? searchParams.get("to") ?? undefined,
  };
  const access = resolveOrdersWorkbenchAccess(actorContext);
  const where = await buildOrdersWorkbenchWhere(access, filters);
  const orderBy = ordersWorkbenchOrderBy(
    searchParams.get("sort"),
    access.financials,
  );
  const filtered = Boolean(
    filters.status ||
      filters.q ||
      filters.wilayaCode ||
      filters.dateFrom ||
      filters.dateTo,
  );

  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "export.orders",
      entity: "orders",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { format, ...(filtered ? { filtered: true } : {}) },
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
    { key: "deliveryProvider", label: t("export.orders.provider") },
    { key: "source", label: t("export.orders.source") },
    { key: "createdAt", label: t("export.orders.date") },
  ] as const;
  const loadPage = async (take: number, skip: number): Promise<OrderExportRow[]> => {
    // A filtered download is bounded; the unfiltered export streams everything.
    const boundedTake = filtered
      ? Math.max(0, Math.min(take, MAX_FILTERED_EXPORT_ROWS - skip))
      : take;
    if (boundedTake <= 0) return [];
    const orders = await db.order.findMany({
      where,
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
        delivery: {
          select: { provider: true },
          where: { deletedAt: null },
        },
      },
      orderBy,
      take: boundedTake,
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
      deliveryProvider: order.delivery?.provider ?? "",
      source: order.source,
      createdAt: order.createdAt.toLocaleString(localeTag),
    }));
  };

  const filePrefix = locale === "ar" ? "طلبات" : locale === "fr" ? "commandes" : "orders";
  const fileSuffix = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const total = await db.order.count({ where });
    const rows = await collectBoundedXlsxRows(
      filtered ? Math.min(total, MAX_FILTERED_EXPORT_ROWS) : total,
      loadPage,
      filtered ? { maxRows: MAX_FILTERED_EXPORT_ROWS } : undefined,
    );
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
