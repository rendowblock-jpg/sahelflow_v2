import type { Metadata } from "next";
import { Download, ShieldAlert } from "lucide-react";

import { ExportButton, ImportPanel } from "@/components/import/import-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n-server";
import { requireTrustedAction, trustedActionAllowed } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> { const { t } = await getI18n(); return { title: t("metadata.title.importExport") }; }

export default async function ImportsPage() {
  const actorContext = await requireTrustedAction("shops.read");
  const { t } = await getI18n();
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) => trustedActionAllowed(actorContext, action, resource);
  const customerImport = can("data.import") && can("customers.manage") && can("customers.contact.read") && can("customers.contact.update");
  const productImport = can("data.import") && can("products.manage") && can("products.cost.read") && can("products.cost.update");
  const orderExport = can("data.export") && can("orders.read") && can("customers.contact.read") && can("orders.financials.read");
  const customerExport = can("data.export") && can("customers.read") && can("customers.contact.read") && can("orders.financials.read");
  const productExport = can("data.export") && can("products.read") && can("products.cost.read");
  const any = customerImport || productImport || orderExport || customerExport || productExport;

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("imports.title")} description={t("imports.subtitle")} />
      {!any ? <StateSurface icon={ShieldAlert} title={t("error.forbidden")} description={t("error.forbiddenDescription")} tone="warning" /> : null}
      {productImport ? <ImportPanel entity="products" title={t("imports.importProducts")} description={t("imports.importProductsDesc")} /> : null}
      {customerImport ? <ImportPanel entity="customers" title={t("imports.importCustomers")} description={t("imports.importCustomersDesc")} /> : null}
      {orderExport || customerExport || productExport ? (
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Download className="size-4" />{t("imports.exportTitle")}</CardTitle></CardHeader><CardContent><div className="flex flex-wrap gap-2">{orderExport ? <ExportButton entity="orders" label={t("imports.exportOrders")} /> : null}{customerExport ? <ExportButton entity="customers" label={t("imports.exportCustomers")} /> : null}{productExport ? <ExportButton entity="products" label={t("imports.exportProducts")} /> : null}</div></CardContent></Card>
      ) : null}
    </div>
  );
}
