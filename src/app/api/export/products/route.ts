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

type ProductExportRow = Record<string, unknown> & {
  name: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  category: string;
  isActive: string;
};

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
    "data.export",
    "products.read",
    "products.cost.read",
  ]);
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  await logAudit(
    { prisma: db, shop: shopContext },
    {
      action: "export.products",
      entity: "products",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { format },
    },
  );
  const { t, locale } = await getI18n();
  const columns = [
    { key: "name", label: t("export.products.name") },
    { key: "sku", label: t("export.products.sku") },
    { key: "price", label: t("export.products.price") },
    { key: "cost", label: t("export.products.cost") },
    { key: "stock", label: t("export.products.stock") },
    { key: "category", label: t("export.products.category") },
    { key: "isActive", label: t("export.products.isActive") },
  ] as const;
  const loadPage = async (take: number, skip: number): Promise<ProductExportRow[]> => {
    const products = await db.product.findMany({
      where: { deletedAt: null },
      select: {
        name: true,
        sku: true,
        price: true,
        cost: true,
        stock: true,
        isActive: true,
        category: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      skip,
    });
    return products.map((product) => ({
      name: product.name,
      sku: product.sku ?? "",
      price: product.price,
      cost: product.cost ?? 0,
      stock: product.stock,
      category: product.category?.name ?? "",
      isActive: product.isActive ? t("common.yes") : t("common.no"),
    }));
  };

  const filePrefix = locale === "ar" ? "منتجات" : locale === "fr" ? "produits" : "products";
  const fileSuffix = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const total = await db.product.count({ where: { deletedAt: null } });
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
}, "GET /api/export/products");
