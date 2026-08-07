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
import {
  trustedActorAuditIdentity,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

type CustomerExportRow = Record<string, unknown> & {
  name: string;
  phone: string;
  phone2: string;
  wilaya: string;
  commune: string;
  address: string;
  orderCount: number;
  totalSpent?: number;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
    "data.export",
    "customers.read",
    "customers.contact.read",
  ]);
  const resource = { shopId: actorContext.shop.shopId };
  const canReadFinancials = trustedActionAllowed(
    actorContext,
    "orders.financials.read",
    resource,
  );
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "export.customers",
      entity: "customers",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { format, financials: canReadFinancials },
    },
  );
  const { t, locale } = await getI18n();
  const columns = [
    { key: "name", label: t("export.customers.name") },
    { key: "phone", label: t("export.customers.phone") },
    { key: "phone2", label: t("export.customers.phone2") },
    { key: "wilaya", label: t("export.customers.wilaya") },
    { key: "commune", label: t("export.customers.commune") },
    { key: "address", label: t("export.customers.address") },
    { key: "orderCount", label: t("export.customers.orderCount") },
    ...(canReadFinancials
      ? [{ key: "totalSpent", label: t("export.customers.totalSpent") }]
      : []),
  ];
  const loadPage = async (take: number, skip: number): Promise<CustomerExportRow[]> => {
    const sourceRows = await db.customer.findMany({
      where: { deletedAt: null },
      select: {
        name: true,
        phone: true,
        phone2: true,
        wilaya: true,
        commune: true,
        address: true,
        orderCount: true,
        totalSpent: canReadFinancials,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    });
    const customers = sourceRows as unknown as Array<{
      name: string;
      phone: string;
      phone2: string | null;
      wilaya: string | null;
      commune: string | null;
      address: string | null;
      orderCount: number;
      totalSpent?: number;
    }>;
    return customers.map((customer) => ({
      name: customer.name,
      phone: customer.phone,
      phone2: customer.phone2 ?? "",
      wilaya: customer.wilaya ?? "",
      commune: customer.commune ?? "",
      address: customer.address ?? "",
      orderCount: customer.orderCount,
      ...(canReadFinancials ? { totalSpent: customer.totalSpent ?? 0 } : {}),
    }));
  };

  const filePrefix = locale === "ar" ? "عملاء" : locale === "fr" ? "clients" : "customers";
  const fileSuffix = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const total = await db.customer.count({ where: { deletedAt: null } });
    const rows = await collectBoundedXlsxRows(total, loadPage);
    return new NextResponse(toXlsx(rows, columns), {
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
}, "GET /api/export/customers");
