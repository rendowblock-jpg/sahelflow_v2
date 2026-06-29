import { getI18n } from "@/lib/i18n-server";
import { ImportPanel, ExportButton } from "@/components/import/import-panel";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.importExport") };
}
export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { t } = await getI18n();

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("imports.title")} description={t("imports.subtitle")} />

      <ImportPanel
        entity="products"
        title={t("imports.importProducts")}
        description={t("imports.importProductsDesc")}
      />

      <ImportPanel
        entity="customers"
        title={t("imports.importCustomers")}
        description={t("imports.importCustomersDesc")}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4" />
            {t("imports.exportTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <ExportButton entity="orders" label={t("imports.exportOrders")} />
            <ExportButton entity="customers" label={t("imports.exportCustomers")} />
            <ExportButton entity="products" label={t("imports.exportProducts")} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
