import { NextRequest, NextResponse } from "next/server";
import { db, shopContext } from "@/lib/db";
import { toCsv, toXlsx } from "@/lib/import/export";
import { requireAuth } from "@/lib/auth/server";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/** GET /api/export/products?format=csv|xlsx */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth([
    "data.export",
    "products.read",
    "products.cost.read",
  ]);
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "export.products",
    entity: "products",
    actor: trustedActorAuditIdentity(actorContext.actor),
    after: { format },
  });
  const { t, locale } = await getI18n();
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
  });

  const rows = products.map((product) => ({
    name: product.name,
    sku: product.sku ?? "",
    price: product.price,
    cost: product.cost ?? 0,
    stock: product.stock,
    category: product.category?.name ?? "",
    isActive: product.isActive ? t("common.yes") : t("common.no"),
  }));
  const columns = [
    { key: "name", label: t("export.products.name") },
    { key: "sku", label: t("export.products.sku") },
    { key: "price", label: t("export.products.price") },
    { key: "cost", label: t("export.products.cost") },
    { key: "stock", label: t("export.products.stock") },
    { key: "category", label: t("export.products.category") },
    { key: "isActive", label: t("export.products.isActive") },
  ];

  const filePrefix = locale === "ar" ? "منتجات" : locale === "fr" ? "produits" : "products";
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
}, "GET /api/export/products");
