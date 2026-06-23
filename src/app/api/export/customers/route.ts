import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/import/export";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/export/customers — download all customers as CSV. */
export const GET = withErrorHandler(async () => {
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
    { key: "name", label: "Nom" },
    { key: "phone", label: "Téléphone" },
    { key: "phone2", label: "Téléphone 2" },
    { key: "wilaya", label: "Wilaya" },
    { key: "commune", label: "Commune" },
    { key: "address", label: "Adresse" },
    { key: "orderCount", label: "Nb Commandes" },
    { key: "totalSpent", label: "Total Dépensé (DA)" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, "GET /api/export/customers");
