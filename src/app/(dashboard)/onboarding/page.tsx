import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getI18n } from "@/lib/i18n-server";

/**
 * /onboarding — 4-step setup wizard for new sellers.
 *
 * Shown after first login when the dashboard is empty (no products, no orders).
 * Steps: business profile → delivery provider → AI key → first product.
 * Each step can be skipped. Target: 5 minutes to first order.
 */
export const dynamic = "force-dynamic";


export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("metadata.title.onboarding") };
}


export default function OnboardingPage() {
  return <OnboardingWizard />;
}
