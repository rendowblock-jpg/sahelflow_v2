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

type ReturnExportRow = Record<string, unknown> & {
  orderNumber: string;
  customerName: string;
  type: string;
  status: string;
  reason: string;
  createdAt: string;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
    "data.export",
    "orders.read",
    "customers.contact.read",
    "orders.financials.read",
  ]);
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "export.returns",
      entity: "returns",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { format },
    },
  );
  const { t, locale } = await getI18n();
  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  const columns = [
    { key: "orderNumber", label: t("export.returns.orderNumber") },
    { key: "customerName", label: t("export.returns.customer") },
    { key: "type", label: t("export.returns.type") },
    { key: "status", label: t("export.returns.status") },
    { key: "reason", label: t("export.returns.reason") },
    { key: "createdAt", label: t("export.returns.date") },
  ] as const;
  const loadPage = async (take: number, skip: number): Promise<ReturnExportRow[]> => {
    const returns = await db.return.findMany({
      where: { deletedAt: null },
      select: {
        order: {
          select: {
            orderNumber: true,
            customer: { select: { name: true } },
          },
        },
        type: true,
        status: true,
        reason: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    });
    return returns.map((entry) => ({
      orderNumber: entry.order.orderNumber,
      customerName: entry.order.customer?.name ?? "",
      type: t(`returns.type.${entry.type}`),
      status: t(`returns.status.${entry.status}`),
      reason: entry.reason,
      createdAt: entry.createdAt.toLocaleString(localeTag),
    }));
  };

  const filePrefix = locale === "ar" ? "إرجاعات" : locale === "fr" ? "retours" : "returns";
  const fileSuffix = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const total = await db.return.count({ where: { deletedAt: null } });
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
}, "GET /api/export/returns");
