import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/import/export";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** GET /api/export/expenses?format=csv|xlsx */
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  void logAudit({ action: "export.expenses", entity: "expenses", actor: "user", after: { format: req.nextUrl.searchParams.get("format") ?? "csv" } });
  const { t, locale } = await getI18n();
  const format = req.nextUrl.searchParams.get("format") ?? "csv";

  const expenses = await db.expense.findMany({
    orderBy: { date: "desc" },
    take: 10000,
  });

  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  const rows = expenses.map((e) => ({
    date: new Date(e.date).toLocaleDateString(localeTag),
    category: t(`accounting.category.${e.category}`),
    description: e.notes ?? "",
    amount: e.amount,
  }));

  const columns = [
    { key: "date", label: t("export.expenses.date") },
    { key: "category", label: t("export.expenses.category") },
    { key: "description", label: t("export.expenses.description") },
    { key: "amount", label: t("export.expenses.amount") },
  ];

  const filePrefix = locale === "ar" ? "مصاريف" : locale === "fr" ? "depenses" : "expenses";
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
}, "GET /api/export/expenses");
