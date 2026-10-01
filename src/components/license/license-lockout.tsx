"use client";

import { useState } from "react";
import { Check, Copy, Gift, Key, Loader2, MessageCircle, Wifi } from "lucide-react";

import { useEntryBrand } from "@/components/auth/entry-brand";
import { LicenseRequestCode } from "@/components/license/license-request-code";
import { licenseStatusKeys, LicenseKeyDialog, useLicenseActions } from "@/components/settings/license-panel";
import { EntryShell, IconTile } from "@/components/system";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { useLicense } from "@/hooks/use-license";
import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support-contact";
import type { LicenseClientStatus } from "@/stores/license-store";

const PROBLEM_STATUSES: ReadonlySet<LicenseClientStatus> = new Set([
  "clock_rollback",
  "device_mismatch",
  "installation_mismatch",
  "workspace_mismatch",
  "product_mismatch",
  "revoked",
  "transfer_required",
]);

function SupportNumber() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(SUPPORT_WHATSAPP_DISPLAY.replaceAll(" ", ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-control border bg-background px-3 py-2">
      <span className="numeric-value whitespace-nowrap text-title-3 text-foreground" dir="ltr">
        {SUPPORT_WHATSAPP_DISPLAY}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={() => void copy()} aria-live="polite">
        {copied ? <Check className="me-1.5 size-4 text-success" aria-hidden="true" /> : <Copy className="me-1.5 size-4" aria-hidden="true" />}
        {copied ? t("license.lockout.copied") : t("license.lockout.copyNumber")}
      </Button>
    </div>
  );
}

/**
 * First-run licence surface. A new seller sees one clear primary path — the
 * free trial — with activation and purchase as the honest alternatives; an
 * ended trial or a licence problem changes the heading, never hides the data
 * promise or the way to reach a human.
 */
export function LicenseLockout() {
  const { t } = useI18n();
  const brand = useEntryBrand();
  const { projection, error: authorityError } = useLicense();
  const actions = useLicenseActions();

  const status: LicenseClientStatus = projection?.status ?? "unavailable";
  const expired = status === "expired";
  const problem = PROBLEM_STATUSES.has(status);
  const trialAvailable =
    projection?.onlineTrialAvailable === true && projection?.type !== "permanent" && !expired && !problem;

  const title = expired
    ? t("license.lockout.expiredTitle")
    : problem
      ? t("license.lockout.problemTitle")
      : t("license.lockout.title");
  const description = expired
    ? t("license.lockout.expiredDescription")
    : problem
      ? t("license.lockoutHelp")
      : t("license.lockout.description");

  return (
    <EntryShell {...brand} title={title} description={description} width="md">
      <div className="space-y-4">
        {trialAvailable ? (
          <section className="space-y-4 rounded-surface border border-primary/30 bg-primary-subtle p-5" aria-labelledby="license-trial-title">
            <div className="flex items-start gap-3">
              <IconTile icon={Gift} tone="primary" size="md" />
              <div className="min-w-0 space-y-0.5">
                <h2 id="license-trial-title" className="text-title-3 text-foreground">{t("license.lockout.trialTitle")}</h2>
                <p className="text-body-sm text-muted-foreground">{t("license.lockout.trialDescription")}</p>
              </div>
            </div>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => void actions.startOrRecoverTrial()}
              disabled={actions.requestingTrial}
            >
              {actions.requestingTrial ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" /> : null}
              {t("license.lockout.startTrial")}
            </Button>
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Wifi className="size-3.5" aria-hidden="true" />
              {t("license.lockout.trialNeedsInternet")}
            </p>
          </section>
        ) : null}

        {projection?.onlineTrialAvailable === false && projection?.type !== "permanent" ? (
          <p className="rounded-control border border-warning/40 bg-warning-soft p-3 text-body-sm text-muted-foreground">
            {t("license.founderOfflineCheckpoint")}
          </p>
        ) : null}

        <section className="space-y-3 rounded-surface border bg-surface-2 p-5" aria-labelledby="license-activate-title">
          <div className="flex items-start gap-3">
            <IconTile icon={Key} tone="neutral" size="md" />
            <div className="min-w-0 space-y-0.5">
              <h2 id="license-activate-title" className="text-title-3 text-foreground">{t("license.lockout.haveLicense")}</h2>
              <p className="text-body-sm text-muted-foreground">{t("license.lockout.haveLicenseDescription")}</p>
            </div>
          </div>
          <LicenseKeyDialog
            actions={actions}
            trigger={
              <Button type="button" variant={trialAvailable ? "outline" : "default"} className="w-full">
                {t("license.lockout.activateLicense")}
              </Button>
            }
          />
        </section>

        <section className="space-y-3 rounded-surface border bg-surface-2 p-5" aria-labelledby="license-buy-title">
          <div className="flex items-start gap-3">
            <IconTile icon={MessageCircle} tone="success" size="md" />
            <div className="min-w-0 space-y-0.5">
              <h2 id="license-buy-title" className="text-title-3 text-foreground">{t("license.lockout.buyTitle")}</h2>
              <p className="text-body-sm text-muted-foreground">{t("license.lockout.buyDescription")}</p>
            </div>
          </div>
          <SupportNumber />
          <LicenseRequestCode />
        </section>

        {actions.error ? (
          <p className="rounded-control border border-destructive/25 bg-destructive-subtle p-3 text-body-sm text-destructive" role="alert">
            {actions.error}
          </p>
        ) : null}
        {authorityError ? (
          <p className="text-body-sm text-destructive" role="alert">{t("license.status.unavailable")}</p>
        ) : null}

        <p className="text-caption text-muted-foreground">
          {t("license.lockout.statusLine", { status: t(licenseStatusKeys[status]) })}
        </p>
      </div>
    </EntryShell>
  );
}
