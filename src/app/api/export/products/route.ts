import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/import/export";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** GET /api/export/products — download all products as CSV. */
export const GET = withErrorHandler(async () => {
  const { t, locale } = await getI18n();
  const products = await db.product.findMany({
    include: { category: true },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const rows = products.map((p) => ({
    name: p.name,
    sku: p.sku ?? "",
    price: p.price,
    cost: p.cost ?? 0,
    stock: p.stock,
    category: p.category?.name ?? "",
    isActive: p.isActive ? t("common.yes") : t("common.no"),
  }));

  const csv = toCsv(rows, [
    { key: "name", label: t("export.products.name") },
    { key: "sku", label: t("export.products.sku") },
    { key: "price", label: t("export.products.price") },
    { key: "cost", label: t("export.products.cost") },
    { key: "stock", label: t("export.products.stock") },
    { key: "category", label: t("export.products.category") },
    { key: "isActive", label: t("export.products.isActive") },
  ]);

  const filePrefix = locale === "ar" ? "منتجات" : locale === "fr" ? "produits" : "products";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filePrefix}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, "GET /api/export/products");
