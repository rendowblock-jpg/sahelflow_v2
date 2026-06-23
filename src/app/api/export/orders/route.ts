import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/import/export";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/** GET /api/export/orders — download all orders as CSV. */
export const GET = withErrorHandler(async () => {
  const orders = await db.order.findMany({
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take: 10000,
  });

  const rows = orders.map((o) => ({
    orderNumber: o.orderNumber,
    status: o.status,
    customerName: o.customer.name,
    phone: o.phone,
    wilaya: o.wilaya,
    commune: o.commune,
    totalPrice: o.totalPrice,
    deliveryCost: o.deliveryCost ?? 0,
    source: o.source,
    createdAt: new Date(o.createdAt).toLocaleString("fr-FR"),
  }));

  const csv = toCsv(rows, [
    { key: "orderNumber", label: "N° Commande" },
    { key: "status", label: "Statut" },
    { key: "customerName", label: "Client" },
    { key: "phone", label: "Téléphone" },
    { key: "wilaya", label: "Wilaya" },
    { key: "commune", label: "Commune" },
    { key: "totalPrice", label: "Total (DA)" },
    { key: "deliveryCost", label: "Livraison (DA)" },
    { key: "source", label: "Source" },
    { key: "createdAt", label: "Date" },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, "GET /api/export/orders");
