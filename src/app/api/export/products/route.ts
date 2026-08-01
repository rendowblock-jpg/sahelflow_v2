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
  const actorContext = await requireAuth(["data.export", "products.read", "products.cost.read"]);
  await logAudit({ prisma: db, shop: shopContext }, { action: "export.products", entity: "products", actor: trustedActorAuditIdentity(actorContext.actor), after: { format: req.nextUrl.searchParams.get("format") ?? "csv" } });
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const { t, locale } = await getI18n();
  const products = await db.product.findMany({
    where: { deletedAt: null },
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
}, "GET /api/export/products");
