import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { logAudit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { toXlsx } from "@/lib/import/export";
import { exportAuditAfter, exportRowHeaders } from "@/lib/import/export-audit";
import { attachmentContentDisposition } from "@/lib/import/export-disposition";
import {
  collectBoundedXlsxRows,
  createPagedCsvStream,
} from "@/lib/import/paged-export";
import { getI18n } from "@/lib/i18n-server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { expenseCsvDate } from "@/lib/time/shop-day-format";
import { intlLocale } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExpenseExportRow = Record<string, unknown> & {
  date: string;
  category: string;
  description: string;
  amount: number;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth(["data.export", "accounting.read"]);
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const summary = { totalMatching: await db.expense.count({ where: { deletedAt: null } }) };
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "export.expenses",
      entity: "expenses",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: exportAuditAfter({ entity: "expenses", format, summary }),
    },
  );
  const { t, locale } = await getI18n();
  const localeTag = intlLocale(locale);
  const columns = [
    { key: "date", label: t("export.expenses.date") },
    { key: "category", label: t("export.expenses.category") },
    { key: "description", label: t("export.expenses.description") },
    { key: "amount", label: t("export.expenses.amount") },
  ] as const;
  const loadPage = async (take: number, skip: number): Promise<ExpenseExportRow[]> => {
    const expenses = await db.expense.findMany({
      where: { deletedAt: null },
      select: { date: true, category: true, notes: true, amount: true },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take,
      skip,
    });
    return expenses.map((expense) => ({
      date: expenseCsvDate(expense.date, localeTag),
      category: t(`accounting.category.${expense.category}`),
      description: expense.notes ?? "",
      amount: expense.amount,
    }));
  };

  const filePrefix = locale === "ar" ? "مصاريف" : locale === "fr" ? "depenses" : "expenses";
  const fileSuffix = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const rows = await collectBoundedXlsxRows(summary.totalMatching, loadPage);
    return new NextResponse(toXlsx(rows, [...columns]), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ...exportRowHeaders(summary),
        "Content-Disposition": attachmentContentDisposition(
          `${filePrefix}-${fileSuffix}.xlsx`,
          `expenses-${fileSuffix}.xlsx`,
        ),
      },
    });
  }

  return new NextResponse(createPagedCsvStream(columns, loadPage), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      ...exportRowHeaders(summary),
      "Content-Disposition": attachmentContentDisposition(
        `${filePrefix}-${fileSuffix}.csv`,
        `expenses-${fileSuffix}.csv`,
      ),
      "Cache-Control": "no-store",
    },
  });
}, "GET /api/export/expenses");
