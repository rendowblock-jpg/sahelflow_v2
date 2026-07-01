import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

/**
 * /onboarding — 4-step setup wizard for new sellers.
 *
 * Shown after first login when the dashboard is empty (no products, no orders).
 * Steps: business profile → delivery provider → AI key → first product.
 * Each step can be skipped. Target: 5 minutes to first order.
 */
export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return <OnboardingWizard />;
}
