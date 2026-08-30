import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const wizard = read("src/components/onboarding/onboarding-wizard.tsx");
const checklist = read("src/components/onboarding/onboarding-checklist.tsx");
const pairing = read("src/components/onboarding/onboarding-pairing-panel.tsx");
const loop = read("src/components/onboarding/flagship-loop-explainer.tsx");
const progress = read("src/components/onboarding/onboarding-progress.ts");
const page = read("src/app/(dashboard)/onboarding/page.tsx");
const runtimeDict = read("src/lib/i18n/onboarding-runtime.ts");
const runtimeRegistry = read("src/lib/i18n/runtime-translations.ts");

describe("Onboarding checklist-driven wizard contract (R4-b)", () => {
  it("renders a persistent completion checklist linking every step", () => {
    expect(wizard).toContain("OnboardingChecklist");
    expect(wizard).toContain('data-onboarding-wizard="v2"');
    expect(checklist).toContain('data-onboarding-checklist="true"');
    expect(checklist).toContain('data-onboarding-checklist-item={item.id}');
    expect(checklist).toContain("data-done={item.done}");
    // Every checklist item is a button that navigates to its step.
    expect(checklist).toContain("onSelectStep(item.step)");
    expect(checklist).toContain('"shop"');
    expect(checklist).toContain('"whatsapp"');
    expect(checklist).toContain('"couriers"');
    expect(checklist).toContain('"ai"');
    // Progress counter ({{done}} of {{total}}).
    expect(checklist).toContain("onboarding.checklist.progress");
  });

  it("replaces the free-text wilaya Input with the localized WilayaCommuneSelect pair", () => {
    expect(wizard).toContain('WilayaCommuneSelect');
    expect(wizard).toContain("onWilayaChange={setBusinessWilaya}");
    expect(wizard).toContain("onCommuneChange={setBusinessCommune}");
    expect(wizard).toContain('wilayaLabel={t("onboarding.business.wilaya")}');
    // The old free-text wilaya input is gone.
    expect(wizard).not.toContain('id="biz-wilaya"');
    expect(wizard).not.toContain('placeholder="Alger"');
    // No Select of provider names inline either (couriers are registry-driven).
    expect(wizard).not.toContain('<SelectItem value="yalidine">');
  });

  it("uses the canonical DZ phone module for the bidi-safe phone field", () => {
    expect(wizard).toContain('"@/lib/validation/phone"');
    expect(wizard).toContain("DZ_PHONE_PLACEHOLDER");
    expect(wizard).toContain("formatDZPhone(e.target.value)");
    expect(wizard).toContain("isValidDZMobilePhone(businessPhone)");
    expect(wizard).toContain("normalizeDZPhone(businessPhone)");
    // Bidi discipline: digits render LTR inside the RTL layout.
    expect(wizard).toMatch(/id="biz-phone"[\s\S]{0,200}type="tel"/);
    expect(wizard).toMatch(/id="biz-phone"[\s\S]{0,200}dir="ltr"/);
    expect(wizard).toContain('inputMode="tel"');
    expect(wizard).toContain('autoComplete="tel-national"');
  });

  it("keeps every step skippable-with-return", () => {
    // Skip button on every content step (summary uses launch instead).
    expect(wizard).toContain("data-onboarding-skip={steps[step]?.id}");
    expect(wizard).toContain("skipStep");
    expect(wizard).toContain('t("common.skip")');
    // Back navigation is always available past the first step.
    expect(wizard).toContain("goToStep(step - 1)");
    // The checklist restores skipped steps by linking back to them.
    expect(checklist).toContain("onSelectStep");
    expect(wizard).toContain("onSelectStep={(target) => goToStep(target)}");
    expect(wizard).toContain("onSelectFinish");
  });

  it("embeds WhatsApp pairing without dragging the inbox workspace hook in", () => {
    expect(wizard).toContain("OnboardingPairingPanel");
    expect(wizard).toContain("onConnectedChange={handleConnectedChange}");
    // Headless sibling reuses the pairing state machine + copy authority.
    expect(pairing).toContain("deriveWhatsAppPairingPhase");
    expect(pairing).toContain("getWhatsAppPairingCopy");
    expect(pairing).toContain('"/api/whatsapp/status"');
    expect(pairing).toContain('"/api/whatsapp/connect"');
    expect(pairing).toContain("/api/whatsapp/qr-image?refresh=");
    // The inbox dialog itself stays untouched (no workspace prop adapter):
    // the panel never imports the inbox workspace hook or the dialog component.
    expect(pairing).not.toContain('"@/hooks/use-inbox-workspace"');
    expect(pairing).not.toContain('"@/components/inbox/whatsapp-pairing-dialog"');
  });

  it("drives couriers from the delivery provider registry with test-connection", () => {
    // The settings integrations panel is embedded verbatim.
    expect(wizard).toContain(
      '"@/components/settings/delivery-credentials-panel"',
    );
    expect(wizard).toContain("<DeliveryCredentialsPanel />");
    const panel = read(
      "src/components/settings/delivery-credentials-panel-wave3.tsx",
    );
    // Registry-driven providers (all four, including EcoTrack — d5 finding).
    expect(panel).toContain('"ecotrack"');
    expect(panel).toContain('"yalidine"');
    expect(panel).toContain('"maystro"');
    expect(panel).toContain('"zrexpress"');
    expect(panel).toContain('"/api/delivery/test-connection"');
    expect(panel).toContain('t("integrations.testConnection")');
  });

  it("embeds the settings AI key flow with server-computed capability flags", () => {
    expect(wizard).toContain('"@/components/settings/ai-key-panel"');
    expect(wizard).toContain("canManageKey={access.aiKey}");
    expect(wizard).toContain("canManageConsent={access.aiConsent}");
    expect(page).toContain('aiKey: can("integrations.manage")');
    expect(page).toContain('aiConsent: can("settings.manage")');
    expect(page).toContain('delivery: can("delivery.credentials.manage")');
    expect(page).toContain("requireTrustedAction");
  });

  it("derives checklist truth from live configuration, not self-reported clicks", () => {
    expect(wizard).toContain('"/api/settings"');
    expect(wizard).toContain('"/api/whatsapp/status"');
    expect(wizard).toContain('"/api/delivery/credentials"');
    expect(wizard).toContain('"/api/secrets/gemini-key"');
    expect(wizard).toContain("Promise.allSettled");
    expect(wizard).toContain("data.status === \"connected\"");
    expect(wizard).toContain("data.configured === true");
    expect(wizard).toContain("refreshStatus()");
  });

  it("persists progress through the generic settings key so the checklist survives restarts", () => {
    expect(progress).toContain(
      'ONBOARDING_PROGRESS_SETTING_KEY = "onboarding_progress"',
    );
    expect(wizard).toContain("ONBOARDING_PROGRESS_SETTING_KEY");
    expect(wizard).toContain("parseOnboardingProgress");
    expect(wizard).toContain("serializeOnboardingProgress");
    expect(wizard).toContain("lastStep: clamped");
    // The wizard never writes a second persistence mechanism (localStorage).
    expect(wizard).not.toContain("localStorage");
    // Shop basics still persist through the same settings/profile endpoints.
    expect(wizard).toContain('"/api/profile"');
    expect(wizard).toContain("business_wilaya");
    expect(wizard).toContain("business_commune");
  });

  it("finishes on a completion summary with settings deep links", () => {
    expect(wizard).toContain('data-onboarding-step="summary"');
    expect(wizard).toContain("data-onboarding-summary-item={row.id}");
    expect(wizard).toContain("data-done={row.done}");
    expect(wizard).toContain('"/settings?group=connections"');
    expect(wizard).toContain('"/settings?group=intelligence"');
    expect(wizard).toContain('"/inbox"');
    expect(wizard).toContain('t("onboarding.youreAllSet")');
    expect(wizard).toContain('t("onboarding.launchDashboard")');
  });

  it("teaches the flagship message → AI-extract → order loop", () => {
    expect(wizard).toContain('<FlagshipLoopExplainer variant="full" />');
    // Contextual callout right after WhatsApp pairing succeeds.
    expect(wizard).toContain('<FlagshipLoopExplainer variant="compact" />');
    expect(loop).toContain("onboarding.loop.beat1.title");
    expect(loop).toContain("onboarding.loop.beat2.title");
    expect(loop).toContain("onboarding.loop.beat3.title");
    expect(loop).toContain("MessageCircle");
    expect(loop).toContain("Bot");
    expect(loop).toContain("PackageCheck");
    expect(loop).toContain("icon-rtl-flip");
  });

  it("ships every new runtime key in EN, FR and AR and registers the dictionary", () => {
    const keys = [
      "onboarding.checklist.title",
      "onboarding.checklist.progress",
      "onboarding.checklist.openStep",
      "onboarding.checklist.stepDone",
      "onboarding.shop.title",
      "onboarding.shop.description",
      "onboarding.couriers.title",
      "onboarding.couriers.description",
      "onboarding.summary.title",
      "onboarding.summary.skipped",
      "onboarding.summary.openSettings",
      "onboarding.summary.openInbox",
      "onboarding.loop.title",
      "onboarding.loop.subtitle",
      "onboarding.loop.beat1.title",
      "onboarding.loop.beat1.body",
      "onboarding.loop.beat2.title",
      "onboarding.loop.beat2.body",
      "onboarding.loop.beat3.title",
      "onboarding.loop.beat3.body",
      "onboarding.phone.invalid",
      "onboarding.skipHint",
    ];
    for (const key of keys) {
      // Once per locale block (en/fr/ar).
      expect(runtimeDict.split(`"${key}"`).length - 1, key).toBe(3);
    }
    expect(runtimeDict).toContain("en: {");
    expect(runtimeDict).toContain("fr: {");
    expect(runtimeDict).toContain("ar: {");
    // Registered in the shared runtime translation chain.
    expect(runtimeRegistry).toContain(
      "getOnboardingRuntimeTranslation(locale, key)",
    );
    expect(runtimeRegistry).toContain(
      'import { getOnboardingRuntimeTranslation } from "@/lib/i18n/onboarding-runtime";',
    );
  });

  it("reuses existing static onboarding locale keys instead of duplicating them", () => {
    const en = read("src/lib/i18n/locales/en.json");
    for (const existing of [
      "onboarding.connectWhatsApp",
      "onboarding.connectWhatsAppDesc",
      "onboarding.business.name",
      "onboarding.business.phone",
      "onboarding.business.wilaya",
      "onboarding.steps.ai",
      "onboarding.step2.title",
      "onboarding.step2.description",
      "onboarding.finish",
      "onboarding.finishSetup",
      "onboarding.launchDashboard",
      "onboarding.youreAllSet",
      "onboarding.dashboardReady",
      "onboarding.complete",
      "onboarding.completed",
      "onboarding.storeNamePlaceholder",
      "onboarding.saveFailed",
    ]) {
      expect(en).toContain(`"${existing}"`);
    }
    // None of those keys are re-defined in the runtime dictionary.
    for (const existing of [
      "onboarding.connectWhatsApp",
      "onboarding.business.name",
      "onboarding.finish",
      "onboarding.launchDashboard",
    ]) {
      expect(runtimeDict).not.toContain(`"${existing}":`);
    }
  });
});
