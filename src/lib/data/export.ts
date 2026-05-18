/**
 * SahelFlow CSV Export Module
 * Generates and downloads CSV files for orders & customers
 */

import { getOrders, getCustomers } from "@/lib/data/service";

function escapeCSV(val: unknown): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export orders to CSV
 */
export async function exportOrdersCSV() {
  const orders = (await getOrders({ limit: 10000 })).data as Array<
    Record<string, unknown>
  >;

  const headers = [
    "Order #",
    "Status",
    "Customer",
    "Phone",
    "Wilaya",
    "Commune",
    "Total (DA)",
    "Delivery Cost",
    "Profit",
    "Items",
    "Notes",
    "Created",
  ];

  const rows = orders.map((o) => {
    const customer = o.customer as Record<string, unknown> | null;
    const items = o.items as Array<Record<string, unknown>> | undefined;
    const itemStr = Array.isArray(items)
      ? items
          .map((i) => `${i.name || i.product_name}x${i.quantity || 1}`)
          .join("; ")
      : "";
    return [
      o.order_number,
      o.status,
      customer?.name || "",
      customer?.phone || "",
      o.wilaya,
      o.commune,
      o.total_price,
      o.delivery_cost,
      o.net_profit,
      itemStr,
      o.notes,
      o.created_at ? new Date(String(o.created_at)).toLocaleDateString() : "",
    ].map(escapeCSV);
  });

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const date = new Date().toISOString().split("T")[0];
  downloadCSV(`sahelflow_orders_${date}.csv`, csv);
  return orders.length;
}

/**
 * Export customers to CSV
 */
export async function exportCustomersCSV() {
  const customers = (await getCustomers({ limit: 10000 })).data as Array<
    Record<string, unknown>
  >;

  const headers = [
    "Name",
    "Phone",
    "Wilaya",
    "Commune",
    "Orders",
    "Total Spent (DA)",
    "Risk Score",
    "Blocked",
    "Created",
  ];

  const rows = customers.map((c) =>
    [
      c.name,
      c.phone,
      c.wilaya,
      c.commune,
      c.order_count,
      c.total_spent,
      c.risk_score,
      c.is_blocked ? "Yes" : "No",
      c.created_at ? new Date(String(c.created_at)).toLocaleDateString() : "",
    ].map(escapeCSV),
  );

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const date = new Date().toISOString().split("T")[0];
  downloadCSV(`sahelflow_customers_${date}.csv`, csv);
  return customers.length;
}

export async function exportAnalyticsCSV(data: {
  totalOrders: number;
  totalRevenue: number;
  totalDeliveryCost: number;
  netProfit: number;
  confirmationRate: number;
  deliveryRate: number;
  returnRate: number;
  avgOrderValue: number;
  topWilayas: Array<{
    wilaya: string;
    orders: number;
    revenue: number;
    delivered: number;
    returned: number;
  }>;
  topProducts: Array<{ name: string; quantity: number }>;
}) {
  const lines: string[] = [];

  // Summary section
  lines.push("Metric,Value");
  lines.push(`Total Orders,${data.totalOrders}`);
  lines.push(`Total Revenue,${data.totalRevenue}`);
  lines.push(`Total Delivery Cost,${data.totalDeliveryCost}`);
  lines.push(`Net Profit,${data.netProfit}`);
  lines.push(`Confirmation Rate,${data.confirmationRate}%`);
  lines.push(`Delivery Rate,${data.deliveryRate}%`);
  lines.push(`Return Rate,${data.returnRate}%`);
  lines.push(`Avg Order Value,${data.avgOrderValue}`);
  lines.push("");

  // Top Wilayas
  lines.push("Wilaya,Orders,Revenue,Delivered,Returned");
  data.topWilayas.forEach((w) => {
    lines.push(
      `${w.wilaya},${w.orders},${w.revenue},${w.delivered},${w.returned}`,
    );
  });
  lines.push("");

  // Top Products
  lines.push("Product,Quantity Sold");
  data.topProducts.forEach((p) => {
    lines.push(`"${p.name.replace(/"/g, '""')}",${p.quantity}`);
  });

  const csv = lines.join("\n");
  const date = new Date().toISOString().split("T")[0];
  downloadCSV(`sahelflow_analytics_${date}.csv`, csv);
}

export async function exportDeliveryBulkCSV() {
  const supabase = (await import("@/lib/supabase/client")).createClient();

  // Get confirmed + shipped orders with customer data
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "order_number, total_price, delivery_cost, wilaya, commune, address, notes, items, customer:customers(name, phone)",
    )
    .in("status", ["confirmed", "shipped"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!orders || orders.length === 0)
    throw new Error("No orders ready for delivery");

  // iCom-compatible CSV format
  const headers = [
    "Order Number",
    "Customer Name",
    "Phone",
    "Wilaya",
    "Commune",
    "Address",
    "Product",
    "Quantity",
    "Price (DA)",
    "Delivery Cost (DA)",
    "Total (DA)",
    "Notes",
  ];

  const rows = orders.map((o: Record<string, unknown>) => {
    const customer = o.customer as Record<string, unknown> | null;
    const items = (o.items as Array<Record<string, unknown>> | undefined) || [];
    const productLine = items
      .map(
        (i: Record<string, unknown>) =>
          `${i.product_name || i.name || "Product"} x${i.quantity || 1}`,
      )
      .join(" + ");
    const totalQty = items.reduce(
      (s: number, i: Record<string, unknown>) => s + Number(i.quantity || 1),
      0,
    );

    return [
      o.order_number || "",
      customer?.name || "",
      customer?.phone || "",
      o.wilaya || "",
      o.commune || "",
      escapeCSV(o.address || ""),
      escapeCSV(productLine),
      String(totalQty),
      String(o.total_price || 0),
      String(o.delivery_cost || 0),
      String(Number(o.total_price || 0) + Number(o.delivery_cost || 0)),
      escapeCSV(o.notes || ""),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().split("T")[0];
  downloadCSV(`sahelflow-delivery-export-${date}.csv`, csv);

  return orders.length;
}

/**
 * Phase 63D: Export orders in Maystro-specific CSV format
 * Columns match Maystro's bulk import template
 */
export async function exportMaystroCSV() {
  const supabase = (await import("@/lib/supabase/client")).createClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "order_number, total_price, delivery_cost, wilaya, commune, address, notes, items, customer:customers(name, phone)",
    )
    .in("status", ["confirmed", "shipped"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!orders || orders.length === 0)
    throw new Error("No orders ready for delivery");

  // iCom bulk import format
  const headers = [
    "Référence",
    "Nom destinataire",
    "Téléphone",
    "Wilaya",
    "Commune",
    "Adresse",
    "Produit",
    "Montant COD",
    "Poids (kg)",
    "Remarque",
  ];

  const rows = orders.map((o: Record<string, unknown>) => {
    const customer = o.customer as Record<string, unknown> | null;
    const items = (o.items as Array<Record<string, unknown>> | undefined) || [];
    const productLine = items
      .map(
        (i: Record<string, unknown>) =>
          `${i.product_name || i.name || "Product"} x${i.quantity || 1}`,
      )
      .join(" + ");
    return [
      escapeCSV(o.order_number || ""),
      escapeCSV(customer?.name || ""),
      escapeCSV(customer?.phone || ""),
      escapeCSV(o.wilaya || ""),
      escapeCSV(o.commune || ""),
      escapeCSV(o.address || ""),
      escapeCSV(productLine),
      String(o.total_price || 0),
      "1",
      escapeCSV(o.notes || ""),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().split("T")[0];
  downloadCSV(`maystro-import-${date}.csv`, csv);
  return orders.length;
}

/**
 * Phase 63D: Export orders in ZR Express-specific CSV format
 * Columns match ZR Express bulk import template exactly
 */
export async function exportZRExpressCSV() {
  const supabase = (await import("@/lib/supabase/client")).createClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "order_number, total_price, delivery_cost, wilaya, commune, address, notes, items, customer:customers(name, phone)",
    )
    .in("status", ["confirmed", "shipped"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!orders || orders.length === 0)
    throw new Error("No orders ready for delivery");

  // ZR Express bulk import format
  const headers = [
    "Nom",
    "Téléphone",
    "Wilaya",
    "Commune",
    "Adresse",
    "Désignation",
    "Montant",
    "Poids",
    "Référence",
    "Remarque",
  ];

  const rows = orders.map((o: Record<string, unknown>) => {
    const customer = o.customer as Record<string, unknown> | null;
    const items = (o.items as Array<Record<string, unknown>> | undefined) || [];
    const productLine = items
      .map(
        (i: Record<string, unknown>) =>
          `${i.product_name || i.name || "Product"} x${i.quantity || 1}`,
      )
      .join(" + ");
    return [
      escapeCSV(customer?.name || ""),
      escapeCSV(customer?.phone || ""),
      escapeCSV(o.wilaya || ""),
      escapeCSV(o.commune || ""),
      escapeCSV(o.address || ""),
      escapeCSV(productLine),
      String(o.total_price || 0),
      "1",
      escapeCSV(o.order_number || ""),
      escapeCSV(o.notes || ""),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const date = new Date().toISOString().split("T")[0];
  downloadCSV(`zrexpress-import-${date}.csv`, csv);
  return orders.length;
}
