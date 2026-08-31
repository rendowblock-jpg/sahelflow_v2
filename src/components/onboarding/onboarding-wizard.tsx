"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  MessageCircle,
  Rocket,
  SkipForward,
  Store,
  Truck,
} from "lucide-react";

import { FlagshipLoopExplainer } from "@/components/onboarding/flagship-loop-explainer";
import {
  OnboardingChecklist,
  type OnboardingChecklistItem,
} from "@/components/onboarding/onboarding-checklist";
import {
  ONBOARDING_FINISH_STEP,
  ONBOARDING_PROGRESS_SETTING_KEY,
  clampOnboardingStep,
  parseOnboardingProgress,
  serializeOnboardingProgress,
  type OnboardingProgress,
} from "@/components/onboarding/onboarding-progress";
import { OnboardingPairingPanel } from "@/components/onboarding/onboarding-pairing-panel";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { WilayaCommuneSelect } from "@/components/shared/wilaya-commune-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import {
  DZ_PHONE_PLACEHOLDER,
  formatDZPhone,
  isValidDZMobilePhone,
  normalizeDZPhone,
} from "@/lib/validation/phone";

/**
 * Checklist-driven onboarding wizard (R4-b).
 *
 * New IA (Shopify personalized setup checklist — worklog d7-a):
 *   (1) Shop basics   — name + WilayaCommuneSelect (no free-text wilaya) +
 *                       canonical DZ phone mask (type=tel / dir=ltr).
 *   (2) WhatsApp      — embedded pairing panel (QR + live status), skippable.
 *   (3) Couriers      — embedded settings DeliveryCredentialsPanel: registry
 *                       providers (Yalidine / Maystro / ZR Express / EcoTrack)
 *                       with per-provider credentials + test-connection.
 *   (4) AI key        — embedded settings AiKeyPanel (typed key, test & save,
 *                       consent), skippable.
 *   (5) "You're ready" — completion summary (configured ✓ / skipped ○ with
 *                       settings deep links) + the flagship-loop explainer
 *                       (WhatsApp message → AI extracts → Confirm & ship).
 *
 * Every step is skippable-with-return: the persistent checklist tracks
 * completion DERIVED from real configuration state (settings, WhatsApp
 * status, delivery credentials, Gemini key) and every item links back to its
 * step. Progress (resume step + finished flag) persists through the generic
 * settings API key `onboarding_progress` — the same mechanism as
 * `business_wilaya` — so the checklist survives restarts.
 */
type StepId = "shop" | "whatsapp" | "couriers" | "ai" | "summary";

interface OnboardingWizardProps {
  /** Server-computed capability flags (mirrors the settings workspace). */
  access: {
    aiKey: boolean;
    aiConsent: boolean;
    delivery: boolean;
  };
}

interface SetupStatus {
  shop: boolean;
  whatsapp: boolean;
  couriers: boolean;
  ai: boolean;
}

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "x-requested-with": "sahelflow",
} as const;

export function OnboardingWizard({ access }: OnboardingWizardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SetupStatus>({
    shop: false,
    whatsapp: false,
    couriers: false,
    ai: false,
  });
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const prefilledRef = useRef(false);
  // The persisted resume point applies exactly once (initial load) so it can
  // never fight deliberate checklist navigation afterwards.
  const resumedRef = useRef(false);

  // Step 1: Shop basics
  const [businessName, setBusinessName] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessWilaya, setBusinessWilaya] = useState("");
  const [businessCommune, setBusinessCommune] = useState("");

  const phoneInvalid = businessPhone.trim() !== "" && !isValidDZMobilePhone(businessPhone);

  const steps: Array<{ id: StepId; icon: typeof Store; title: string; description: string }> = [
    {
      id: "shop",
      icon: Store,
      title: t("onboarding.shop.title"),
      description: t("onboarding.shop.description"),
    },
    {
      id: "whatsapp",
      icon: MessageCircle,
      title: t("onboarding.connectWhatsApp"),
      description: t("onboarding.connectWhatsAppDesc"),
    },
    {
      id: "couriers",
      icon: Truck,
      title: t("onboarding.couriers.title"),
      description: t("onboarding.couriers.description"),
    },
    {
      id: "ai",
      icon: Bot,
      title: t("onboarding.step2.title"),
      description: t("onboarding.step2.description"),
    },
    {
      id: "summary",
      icon: Rocket,
      title: t("onboarding.youreAllSet"),
      description: t("onboarding.dashboardReady"),
    },
  ];

  /**
   * Best-effort progress persistence via the generic settings API (same
   * mechanism as business_wilaya). The derived checklist keeps working even
   * when this write is unavailable.
   */
  const persistProgress = useCallback(async (progress: OnboardingProgress) => {
    setFinishedAt(progress.finishedAt);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          settings: {
            [ONBOARDING_PROGRESS_SETTING_KEY]:
              serializeOnboardingProgress(progress),
          },
        }),
      });
    } catch {
      // Progress persistence is best-effort — never block onboarding on it.
    }
  }, []);

  /**
   * Derives checklist completion from live configuration truth:
   * settings (profile/wilaya + persisted progress), WhatsApp status,
   * delivery credentials and the Gemini key. Never trusts self-reported
   * "next" clicks.
   */
  const refreshStatus = useCallback(async () => {
    const [settingsResult, whatsappResult, deliveryResult, geminiResult] =
      await Promise.allSettled([
        fetch("/api/settings", { cache: "no-store" }),
        fetch("/api/whatsapp/status", { cache: "no-store" }),
        fetch("/api/delivery/credentials", { cache: "no-store" }),
        fetch("/api/secrets/gemini-key", { cache: "no-store" }),
      ]);

    let shopConfigured = false;
    let whatsappConnected = false;
    let couriersConfigured = false;
    let aiConfigured = false;
    let resume: OnboardingProgress | null = null;

    if (settingsResult.status === "fulfilled" && settingsResult.value.ok) {
      const data = (await settingsResult.value.json().catch(() => ({}))) as {
        settings?: Record<string, string>;
      };
      const settings = data.settings ?? {};
      shopConfigured =
        (settings.profile_name ?? "").trim() !== "" &&
        (settings.business_wilaya ?? "").trim() !== "";
      resume = parseOnboardingProgress(
        settings[ONBOARDING_PROGRESS_SETTING_KEY],
      );

      // Prefill the shop form once from existing configuration so returning
      // sellers never retype their basics.
      if (!prefilledRef.current) {
        prefilledRef.current = true;
        setBusinessName((current) => current || (settings.profile_name ?? ""));
        setBusinessPhone(
          (current) =>
            current || formatDZPhone(settings.profile_phone ?? ""),
        );
        setBusinessWilaya(
          (current) => current || (settings.business_wilaya ?? ""),
        );
        setBusinessCommune(
          (current) => current || (settings.business_commune ?? ""),
        );
      }
    }
    if (whatsappResult.status === "fulfilled" && whatsappResult.value.ok) {
      const data = (await whatsappResult.value.json().catch(() => ({}))) as {
        status?: unknown;
      };
      whatsappConnected = data.status === "connected";
    }
    if (deliveryResult.status === "fulfilled" && deliveryResult.value.ok) {
      const data = (await deliveryResult.value.json().catch(() => ({}))) as {
        providers?: Record<string, Record<string, boolean>>;
      };
      couriersConfigured = Object.values(data.providers ?? {}).some((fields) =>
        Object.values(fields ?? {}).some(Boolean),
      );
    }
    if (geminiResult.status === "fulfilled" && geminiResult.value.ok) {
      const data = (await geminiResult.value.json().catch(() => ({}))) as {
        configured?: unknown;
      };
      aiConfigured = data.configured === true;
    }

    setStatus({
      shop: shopConfigured,
      whatsapp: whatsappConnected,
      couriers: couriersConfigured,
      ai: aiConfigured,
    });

    if (resume) {
      setFinishedAt(resume.finishedAt);
      if (!resumedRef.current) {
        resumedRef.current = true;
        // Apply the persisted resume point only while the seller is still on
        // the initial screen — a deliberate navigation wins over the resume.
        setStep((current) =>
          current === 0 ? clampOnboardingStep(resume.lastStep) : current,
        );
      }
    }
    return { resume };
  }, []);

  // Initial load: derive checklist truth + resume point in one pass.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshStatus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshStatus]);

  // Live WhatsApp truth while the pairing step is on screen (the embedded
  // panel polls the sidecar every second).
  const handleConnectedChange = useCallback((connected: boolean) => {
    // The pairing panel reports on every status poll (1s) — keep the state
    // referentially stable unless the connection truth actually flips.
    setStatus((current) =>
      current.whatsapp === connected
        ? current
        : { ...current, whatsapp: connected },
    );
  }, []);

  function goToStep(next: number) {
    const clamped = clampOnboardingStep(next);
    setStep(clamped);
    void persistProgress({
      version: 1,
      lastStep: clamped,
      finishedAt,
    });
    if (clamped !== 1) void refreshStatus();
  }

  async function saveShopBasics(): Promise<boolean> {
    setLoading(true);
    try {
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          name: businessName.trim(),
          // Canonical national digits ("0555123456"); omitted when blank so
          // an untouched field never overwrites an existing phone with "".
          ...(businessPhone.trim()
            ? { phone: normalizeDZPhone(businessPhone) }
            : {}),
        }),
      });
      if (!profileRes.ok) {
        throw new Error(`Profile save failed (${profileRes.status})`);
      }
      if (businessWilaya) {
        const settingRes = await fetch("/api/settings", {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            settings: {
              business_wilaya: businessWilaya,
              ...(businessCommune ? { business_commune: businessCommune } : {}),
            },
          }),
        });
        if (!settingRes.ok) {
          throw new Error(`Settings save failed (${settingRes.status})`);
        }
      }
      return true;
    } catch (err) {
      // AUDIT-5 C3 discipline: surface the failure and DO NOT advance.
      toast.error(
        err instanceof Error ? err.message : t("onboarding.saveFailed"),
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function nextStep() {
    if (step === 0) {
      if (!businessName.trim() || phoneInvalid) return;
      const saved = await saveShopBasics();
      if (!saved) return;
      await refreshStatus();
      goToStep(1);
      return;
    }
    if (step === 2 || step === 3) {
      // The embedded panels persist their own credentials; re-derive the
      // checklist before moving on so the summary never lies.
      await refreshStatus();
    }
    if (step < ONBOARDING_FINISH_STEP) {
      goToStep(step + 1);
    }
  }

  function skipStep() {
    if (step < ONBOARDING_FINISH_STEP) {
      goToStep(step + 1);
    }
  }

  async function launchDashboard() {
    setLoading(true);
    await persistProgress({
      version: 1,
      lastStep: ONBOARDING_FINISH_STEP,
      finishedAt: new Date().toISOString(),
    });
    toast.success(t("onboarding.complete"));
    router.push("/dashboard");
    router.refresh();
  }

  const checklistItems: OnboardingChecklistItem[] = [
    { id: "shop", step: 0, done: status.shop },
    { id: "whatsapp", step: 1, done: status.whatsapp },
    { id: "couriers", step: 2, done: status.couriers },
    { id: "ai", step: 3, done: status.ai },
  ];

  const CurrentIcon = steps[step]?.icon ?? Store;
  const currentStepMeta = steps[step];

  const summaryRows: Array<{
    id: OnboardingChecklistItem["id"];
    label: string;
    done: boolean;
    href: string;
    actionLabel: string;
  }> = [
    {
      id: "shop",
      label: t("onboarding.shop.title"),
      done: status.shop,
      href: "#",
      actionLabel: t("common.edit"),
    },
    {
      id: "whatsapp",
      label: t("onboarding.connectWhatsApp"),
      done: status.whatsapp,
      href: "/inbox",
      actionLabel: t("onboarding.summary.openInbox"),
    },
    {
      id: "couriers",
      label: t("onboarding.couriers.title"),
      done: status.couriers,
      href: "/settings?group=connections",
      actionLabel: t("onboarding.summary.openSettings"),
    },
    {
      id: "ai",
      label: t("onboarding.steps.ai"),
      done: status.ai,
      href: "/settings?group=intelligence",
      actionLabel: t("onboarding.summary.openSettings"),
    },
  ];

  return (
    <div
      data-onboarding-wizard="v2"
      className="flex min-h-full items-start justify-center bg-muted/30 p-4 lg:items-center"
    >
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <OnboardingChecklist
          items={checklistItems}
          currentStep={step}
          finished={finishedAt != null}
          onSelectStep={(target) => goToStep(target)}
          onSelectFinish={() => goToStep(ONBOARDING_FINISH_STEP)}
        />

        <main className="min-w-0">
          {/* Step header */}
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <CurrentIcon className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                {currentStepMeta?.title}
              </h1>
              <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                {currentStepMeta?.description}
              </p>
            </div>
          </div>

          {step === 0 && (
            <Card data-onboarding-step="shop">
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="biz-name">{t("onboarding.business.name")}</Label>
                  <Input
                    id="biz-name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder={t("onboarding.storeNamePlaceholder")}
                    autoComplete="organization"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="biz-phone">{t("onboarding.business.phone")}</Label>
                  {/* Canonical DZ phone field (audit d6 #1): digits are LTR
                      technical content — type=tel + dir=ltr keep the mask
                      stable inside the Arabic RTL layout. */}
                  <Input
                    id="biz-phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    autoComplete="tel-national"
                    className="text-start"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(formatDZPhone(e.target.value))}
                    placeholder={DZ_PHONE_PLACEHOLDER}
                    aria-invalid={phoneInvalid || undefined}
                    aria-describedby={phoneInvalid ? "biz-phone-error" : undefined}
                  />
                  {phoneInvalid ? (
                    <p id="biz-phone-error" role="alert" className="text-xs text-destructive">
                      {t("onboarding.phone.invalid")}
                    </p>
                  ) : null}
                </div>
                {/* Localized wilaya/commune pair replaces the old free-text
                    wilaya Input (d5 finding). */}
                <WilayaCommuneSelect
                  wilaya={businessWilaya}
                  commune={businessCommune}
                  onWilayaChange={setBusinessWilaya}
                  onCommuneChange={setBusinessCommune}
                  wilayaLabel={t("onboarding.business.wilaya")}
                  communeLabel={t("orders.commune")}
                  required
                />
              </CardContent>
            </Card>
          )}

          {step === 1 && (
            <div data-onboarding-step="whatsapp" className="space-y-4">
              <OnboardingPairingPanel onConnectedChange={handleConnectedChange} />
              {status.whatsapp ? <FlagshipLoopExplainer variant="compact" /> : null}
            </div>
          )}

          {step === 2 && (
            <div data-onboarding-step="couriers" className="space-y-4">
              {/* Registry-driven provider list (Yalidine / Maystro / ZR Express
                  / EcoTrack) with credentials + test-connection, reused from
                  the settings integrations surface. */}
              <DeliveryCredentialsPanel />
            </div>
          )}

          {step === 3 && (
            <div data-onboarding-step="ai" className="space-y-4">
              {/* Reuses the settings AI key flow: typed password key,
                  test-and-save validation, consent checkbox, reauth gate. */}
              <AiKeyPanel
                canManageKey={access.aiKey}
                canManageConsent={access.aiConsent}
              />
            </div>
          )}

          {step === 4 && (
            <div data-onboarding-step="summary" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t("onboarding.summary.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {summaryRows.map((row) => (
                      <li
                        key={row.id}
                        data-onboarding-summary-item={row.id}
                        data-done={row.done}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {row.done ? (
                            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                          ) : (
                            <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />
                          )}
                          {row.label}
                        </span>
                        {row.done && row.id !== "whatsapp" ? (
                          <span className="text-xs text-success">
                            {t("onboarding.completed")}
                          </span>
                        ) : (
                          <span className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">
                              {row.done
                                ? t("onboarding.completed")
                                : t("onboarding.summary.skipped")}
                            </span>
                            {row.id === "shop" ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => goToStep(0)}
                              >
                                {row.actionLabel}
                              </Button>
                            ) : (
                              <Button asChild variant="outline" size="sm">
                                <Link href={row.href}>{row.actionLabel}</Link>
                              </Button>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* The flagship loop the old wizard never taught. */}
              <FlagshipLoopExplainer variant="full" />
            </div>
          )}

          {/* Navigation */}
          <div className="mt-4 flex items-center justify-between">
            {step > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => goToStep(step - 1)}>
                <ArrowLeft className="h-4 w-4 icon-rtl-flip me-1" aria-hidden="true" />
                {t("common.back")}
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {step < ONBOARDING_FINISH_STEP ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={skipStep}
                  data-onboarding-skip={steps[step]?.id}
                >
                  <SkipForward className="h-4 w-4 icon-rtl-flip me-1" aria-hidden="true" />
                  {t("common.skip")}
                </Button>
              ) : null}
              {step === ONBOARDING_FINISH_STEP ? (
                <Button onClick={() => void launchDashboard()} disabled={loading}>
                  <Rocket className="h-4 w-4 me-1" aria-hidden="true" />
                  {t("onboarding.launchDashboard")}
                </Button>
              ) : (
                <Button
                  onClick={() => void nextStep()}
                  disabled={
                    loading ||
                    (step === 0 && (!businessName.trim() || phoneInvalid))
                  }
                  size="sm"
                >
                  {step === ONBOARDING_FINISH_STEP - 1
                    ? t("onboarding.finish")
                    : t("common.next")}
                  <ArrowRight className="h-4 w-4 icon-rtl-flip ms-1" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
