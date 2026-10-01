"use client";

import { useState, type ReactNode } from "react";
import { Calendar, Key, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";

import { LicenseRequestCode } from "@/components/license/license-request-code";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { useLicense } from "@/hooks/use-license";
import type { LicenseClientStatus } from "@/stores/license-store";
import { intlLocale } from "@/lib/utils";

export const licenseStatusKeys: Record<LicenseClientStatus, string> = {
  valid: "license.status.valid",
  missing: "license.status.missing",
  unavailable: "license.status.unavailable",
  invalid: "license.status.invalid",
  expired: "license.status.expired",
  clock_rollback: "license.status.clockRollback",
  device_mismatch: "license.status.machineMismatch",
  installation_mismatch: "license.status.installationMismatch",
  workspace_mismatch: "license.status.workspaceMismatch",
  product_mismatch: "license.status.versionBlocked",
  revoked: "license.status.revoked",
  transfer_required: "license.status.transferRequired",
};

/**
 * The two licence mutations, shared by the Settings panel and the first-run
 * lockout. Each refreshes the client entitlement projection on success.
 */
export function useLicenseActions() {
  const { t } = useI18n();
  const { refresh } = useLicense();
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [requestingTrial, setRequestingTrial] = useState(false);

  async function activate(keyText: string): Promise<boolean> {
    setError(null);
    let entitlement: unknown;
    try {
      entitlement = JSON.parse(keyText);
    } catch {
      setError(t("license.invalidJson"));
      return false;
    }
    if (!entitlement || typeof entitlement !== "object") {
      setError(t("license.invalidFormat"));
      return false;
    }
    setActivating(true);
    try {
      const response = await fetch("/api/license/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "sahelflow",
        },
        body: JSON.stringify(entitlement),
      });
      if (!response.ok) throw new Error(t("license.activationFailed"));
      await refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("license.activationFailed"));
      return false;
    } finally {
      setActivating(false);
    }
  }

  async function startOrRecoverTrial(): Promise<boolean> {
    setError(null);
    setRequestingTrial(true);
    try {
      const response = await fetch("/api/license/trial", {
        method: "POST",
        headers: { "x-requested-with": "sahelflow" },
      });
      if (!response.ok) throw new Error(t("license.trialFailed"));
      await refresh();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("license.trialFailed"));
      return false;
    } finally {
      setRequestingTrial(false);
    }
  }

  return { error, setError, activating, requestingTrial, activate, startOrRecoverTrial };
}

type LicenseActions = ReturnType<typeof useLicenseActions>;

/** Paste-and-activate dialog for a Founder-signed licence. */
export function LicenseKeyDialog({
  actions,
  trigger,
}: {
  actions: LicenseActions;
  trigger: ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");

  async function submit() {
    if (await actions.activate(keyInput)) {
      setOpen(false);
      setKeyInput("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) actions.setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("license.activatePermanent")}</DialogTitle>
          <DialogDescription>{t("license.protectedBindingHelp")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="license-entitlement">{t("license.licenseKey")}</Label>
          <Textarea
            id="license-entitlement"
            value={keyInput}
            onChange={(event) => setKeyInput(event.target.value)}
            placeholder={t("license.pasteJsonPlaceholder")}
            className="min-h-32 font-mono text-caption"
            dir="ltr"
            spellCheck={false}
            autoComplete="off"
          />
          {actions.error ? (
            <p className="text-body-sm text-destructive" role="alert">{actions.error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!keyInput.trim() || actions.activating}>
            {actions.activating && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("license.activate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LicensePanel() {
  const { t, locale } = useI18n();
  const { projection, isLoading, error: authorityError } = useLicense();
  const actions = useLicenseActions();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("license.checking")}
        </CardContent>
      </Card>
    );
  }

  const status: LicenseClientStatus = projection?.status ?? "unavailable";
  const valid = status === "valid";
  const permanent = projection?.type === "permanent";
  const trialRequestAvailable =
    projection?.onlineTrialAvailable === true &&
    !valid &&
    !permanent &&
    status !== "expired";
  const permanentActivationAvailable = !valid || !permanent;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {valid ? (
            <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
          )}
          {t("license.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">{t("license.statusLabel")}</span>
          <Badge variant={valid ? "default" : "destructive"}>{t(licenseStatusKeys[status])}</Badge>
        </div>

        {projection?.type && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">{t("license.typeLabel")}</span>
            <span className="text-sm font-medium">
              {projection.type === "permanent" && t("license.typePermanent")}
              {projection.type === "trial" && t("license.typeTrial")}
              {projection.type === "extension" && t("license.typeExtension")}
            </span>
          </div>
        )}

        {projection?.expiresAt && (
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {t("license.expiresOn")}
            </span>
            <span className="text-sm font-medium">
              {new Date(projection.expiresAt).toLocaleDateString(
                intlLocale(locale),
              )}
            </span>
          </div>
        )}

        {projection?.minimumPermanentRecoveryEpoch && (
          <div className="rounded-control border border-warning/40 bg-warning-soft p-3">
            <p className="text-xs font-medium text-foreground">
              {t("license.permanentRecoveryEpoch")}
            </p>
            <code className="mt-1 block select-all text-sm font-semibold" dir="ltr">
              {projection.minimumPermanentRecoveryEpoch}
            </code>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("license.permanentRecoveryEpochHelp")}
            </p>
          </div>
        )}

        {!valid && <p className="text-sm text-muted-foreground">{t("license.lockoutHelp")}</p>}
        {authorityError && <p className="text-sm text-destructive" role="alert">{t("license.status.unavailable")}</p>}

        <Separator />

        {trialRequestAvailable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void actions.startOrRecoverTrial()}
            disabled={actions.requestingTrial}
          >
            {actions.requestingTrial && (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {t("license.startOrRecoverTrial")}
          </Button>
        )}

        {projection?.onlineTrialAvailable === false && !permanent && (
          <p className="rounded-control border border-warning/40 bg-warning-soft p-3 text-sm text-muted-foreground">
            {t("license.founderOfflineCheckpoint")}
          </p>
        )}

        {permanentActivationAvailable && (
          <LicenseKeyDialog
            actions={actions}
            trigger={
              <Button size="sm">
                <Key className="me-1.5 h-4 w-4" aria-hidden="true" />
                {t("license.enterKey")}
              </Button>
            }
          />
        )}
        {actions.error ? <p className="text-sm text-destructive" role="alert">{actions.error}</p> : null}

        {!permanent ? (
          <div className="space-y-2 rounded-control border bg-surface-1 p-3">
            <p className="text-sm font-medium text-foreground">{t("license.request.panelTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("license.lockout.buyDescription")}</p>
            <LicenseRequestCode />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
