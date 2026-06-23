import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/import/export";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/export/products — download all products as CSV. */
export const GET = withErrorHandler(async () => {
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
    isActive: p.isActive ? "Oui" : "Non",
  }));

  const csv = toCsv(rows, [
    { key: "name", label: "Nom" },
    { key: "sku", label: "SKU" },
    { key: "price", label: "Prix (DA)" },
    { key: "cost", label: "Coût (DA)" },
    { key: "stock", label: "Stock" },
    { key: "category", label: "Catégorie" },
    { key: "isActive", label: "Actif" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="produits-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, "GET /api/export/products");
