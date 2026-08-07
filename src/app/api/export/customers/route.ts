import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/import/export";
import { requireAuth } from "@/lib/auth/server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
    "data.export",
    "customers.read",
    "customers.contact.read",
    "orders.financials.read",
  ]);
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "export.customers",
    entity: "customers",
    actor: trustedActorAuditIdentity(actorContext.actor),
    after: { format: req.nextUrl.searchParams.get("format") ?? "csv" },
  });
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const { t, locale } = await getI18n();
  const customers = await db.customer.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 10000,
  });
  const rows = customers.map((customer) => ({
    name: customer.name,
    phone: customer.phone,
    phone2: customer.phone2 ?? "",
    wilaya: customer.wilaya ?? "",
    commune: customer.commune ?? "",
    address: customer.address ?? "",
    orderCount: customer.orderCount,
    totalSpent: customer.totalSpent,
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
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filePrefix}-${fileSuffix}.csv"`,
    },
  });
}, "GET /api/export/customers");
