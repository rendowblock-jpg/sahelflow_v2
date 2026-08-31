import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

/**
 * /onboarding — checklist-driven setup wizard for new Algerian sellers (R4-b).
 *
 * IA: persistent setup checklist (Shop → WhatsApp pairing → Couriers → AI key,
 * every step skippable-with-return) + a final "You're ready" summary with the
 * flagship message → AI-extract → order loop explainer. Completion is derived
 * from real configuration state and the resume point persists via the generic
 * settings key `onboarding_progress`.
 *
 * Server-side authority mirrors the settings workspace so the embedded
 * courier-credentials and AI-key panels receive the same capability flags they
 * get on /settings.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("metadata.title.onboarding") };
}

export default async function OnboardingPage() {
  const actorContext = await requireTrustedAction("settings.read");
  const resource = { shopId: actorContext.shop.shopId };
  const can = (action: Parameters<typeof trustedActionAllowed>[1]) =>
    trustedActionAllowed(actorContext, action, resource);

  return (
    <OnboardingWizard
      access={{
        aiKey: can("integrations.manage"),
        aiConsent: can("settings.manage"),
        delivery: can("delivery.credentials.manage"),
      }}
    />
  );
}
