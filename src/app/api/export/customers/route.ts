import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/import/export";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** GET /api/export/customers?format=csv|xlsx */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  void logAudit({ prisma: db, shop: shopContext }, { action: "export.customers", entity: "customers", actor: "user", after: { format: req.nextUrl.searchParams.get("format") ?? "csv" } });
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const { t, locale } = await getI18n();
  const customers = await db.customer.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const rows = customers.map((c) => ({
    name: c.name,
    phone: c.phone,
    phone2: c.phone2 ?? "",
    wilaya: c.wilaya ?? "",
    commune: c.commune ?? "",
    address: c.address ?? "",
    orderCount: c.orderCount,
    totalSpent: c.totalSpent,
  }));

  const columns = [
    { key: "name", label: t("export.customers.name") },
    { key: "phone", label: t("export.customers.phone") },
    { key: "phone2", label: t("export.customers.phone2") },
    { key: "wilaya", label: t("export.customers.wilaya") },
    { key: "commune", label: t("export.customers.commune") },
    { key: "address", label: t("export.customers.address") },
    { key: "orderCount", label: t("export.customers.orderCount") },
    { key: "totalSpent", label: t("export.customers.totalSpent") },
  ];

  const filePrefix = locale === "ar" ? "عملاء" : locale === "fr" ? "clients" : "customers";
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
}, "GET /api/export/customers");
