import { ExtractionAnalytics } from "@/components/analytics/extraction-analytics";
import { PageHeader } from "@/components/shared/page-header";
import { getI18n } from "@/lib/i18n-server";
import { assertTrustedAction, requireTrustedAction } from "@/lib/identity/authorization";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("metadata.title.extractionAnalytics") };
}

export default async function ExtractionAnalyticsPage() {
  const actorContext = await requireTrustedAction("analytics.read");
  assertTrustedAction(actorContext, "analytics.financials.read");
  const { t } = await getI18n();

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={t("analytics.extraction.title")}
        description={t("metadata.title.extractionAnalytics")}
      />
      <ExtractionAnalytics />
    </div>
  );
}
