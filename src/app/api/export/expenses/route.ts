import { NextRequest, NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import { toCsv, toXlsx } from "@/lib/import/export";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/export/expenses?format=csv|xlsx */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth(["data.export", "accounting.read"]);
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "export.expenses",
    entity: "expenses",
    actor: trustedActorAuditIdentity(actorContext.actor),
    after: { format },
  });
  const { t, locale } = await getI18n();
  const expenses = await db.expense.findMany({
    where: { deletedAt: null },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  const localeTag = locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
  const rows = expenses.map((expense) => ({
    date: new Date(expense.date).toLocaleDateString(localeTag),
    category: t(`accounting.category.${expense.category}`),
    description: expense.notes ?? "",
    amount: expense.amount,
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
}, "GET /api/export/expenses");
