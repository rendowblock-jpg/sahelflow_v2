import type { Metadata } from "next";
import { Download, ShieldAlert } from "lucide-react";

import { ExportButton, ImportPanel } from "@/components/import/import-panel";
import { PageHeader } from "@/components/shared/page-header";
import { StateSurface } from "@/components/shared/state-surface";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.importExport") };
}
export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { t } = await getI18n();
  const actorContext = await requireTrustedAction("shops.read");
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) =>
    trustedActionAllowed(actorContext, action, resource);

  const canImportOrders =
    can("data.import") &&
    can("orders.create") &&
    can("customers.contact.read") &&
    can("customers.contact.update") &&
    can("orders.financials.read") &&
    can("orders.financials.update");
  const canImportProducts =
    can("data.import") &&
    can("products.read") &&
    can("products.manage") &&
    can("products.cost.read") &&
    can("products.cost.update");
  const canImportCustomers =
    can("data.import") &&
    can("customers.read") &&
    can("customers.manage") &&
    can("customers.contact.read") &&
    can("customers.contact.update");
  const canExportOrders =
    can("data.export") &&
    can("orders.read") &&
    can("customers.contact.read") &&
    can("orders.financials.read");
  const canExportCustomers =
    can("data.export") &&
    can("customers.read") &&
    can("customers.contact.read");
  const canExportProducts =
    can("data.export") &&
    can("products.read") &&
    can("products.cost.read");
  const hasExport = canExportOrders || canExportCustomers || canExportProducts;
  const hasAny = canImportOrders || canImportProducts || canImportCustomers || hasExport;

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("imports.title")} description={t("imports.subtitle")} />

      {!hasAny ? (
        <StateSurface
          icon={ShieldAlert}
          title={t("error.forbidden")}
          description={t("error.forbiddenDesc")}
          tone="warning"
          size="panel"
        />
      ) : null}

      {canImportOrders ? (
        <div id="import-orders" className="scroll-mt-24">
          <ImportPanel
            entity="orders"
            title={t("nav.orders")}
            description={t("imports.subtitle")}
          />
        </div>
      ) : null}

      {canImportProducts ? (
        <div id="import-products" className="scroll-mt-24">
          <ImportPanel
            entity="products"
            title={t("imports.importProducts")}
            description={t("imports.importProductsDesc")}
          />
        </div>
      ) : null}

      {canImportCustomers ? (
        <div id="import-customers" className="scroll-mt-24">
          <ImportPanel
            entity="customers"
            title={t("imports.importCustomers")}
            description={t("imports.importCustomersDesc")}
          />
        </div>
      ) : null}

      {hasExport ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Download className="size-4" aria-hidden="true" />
              {t("imports.exportTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {canExportOrders ? (
                <ExportButton entity="orders" label={t("imports.exportOrders")} />
              ) : null}
              {canExportCustomers ? (
                <ExportButton entity="customers" label={t("imports.exportCustomers")} />
              ) : null}
              {canExportProducts ? (
                <ExportButton entity="products" label={t("imports.exportProducts")} />
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
