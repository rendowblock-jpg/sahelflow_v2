import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/import/export";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** GET /api/export/customers — download all customers as CSV. */
export const GET = withErrorHandler(async () => {
  const { t, locale } = await getI18n();
  const customers = await db.customer.findMany({
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

  const csv = toCsv(rows, [
    { key: "name", label: t("export.customers.name") },
    { key: "phone", label: t("export.customers.phone") },
    { key: "phone2", label: t("export.customers.phone2") },
    { key: "wilaya", label: t("export.customers.wilaya") },
    { key: "commune", label: t("export.customers.commune") },
    { key: "address", label: t("export.customers.address") },
    { key: "orderCount", label: t("export.customers.orderCount") },
    { key: "totalSpent", label: t("export.customers.totalSpent") },
  ]);

  const filePrefix = locale === "ar" ? "عملاء" : locale === "fr" ? "clients" : "customers";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, "GET /api/export/customers");
