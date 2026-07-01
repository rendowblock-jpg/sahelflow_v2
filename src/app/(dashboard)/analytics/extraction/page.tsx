import { ExtractionAnalytics } from "@/components/analytics/extraction-analytics";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";


export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("metadata.title.extractionAnalytics") };
}


export default function ExtractionAnalyticsPage() {
  return <ExtractionAnalytics />;
}
