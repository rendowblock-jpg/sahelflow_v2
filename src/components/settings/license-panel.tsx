"use client";

import { useState } from "react";
import { Calendar, Key, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/hooks/use-i18n";
import { useLicense } from "@/hooks/use-license";
import type { LicenseClientStatus } from "@/stores/license-store";

const statusKeys: Record<LicenseClientStatus, string> = {
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

export function LicensePanel() {
  const { t, locale } = useI18n();
  const { projection, isLoading, error: authorityError, refresh } = useLicense();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [requestingTrial, setRequestingTrial] = useState(false);

  async function activate() {
    setError(null);
    let entitlement: unknown;
    try {
      entitlement = JSON.parse(keyInput);
    } catch {
      setError(t("license.invalidJson"));
      return;
    }
    if (!entitlement || typeof entitlement !== "object") {
      setError(t("license.invalidFormat"));
      return;
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
      setDialogOpen(false);
      setKeyInput("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("license.activationFailed"));
    } finally {
      setActivating(false);
    }
  }

  async function startOrRecoverTrial() {
    setError(null);
    setRequestingTrial(true);
    try {
      const response = await fetch("/api/license/trial", {
        method: "POST",
        headers: { "x-requested-with": "sahelflow" },
      });
      if (!response.ok) throw new Error(t("license.trialFailed"));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("license.trialFailed"));
    } finally {
      setRequestingTrial(false);
    }
  }

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
  const trialRequestAvailable = !valid && !permanent && status !== "expired";
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
          <Badge variant={valid ? "default" : "destructive"}>{t(statusKeys[status])}</Badge>
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
                locale === "ar" ? "ar-DZ" : locale === "en" ? "en-GB" : "fr-FR",
              )}
            </span>
          </div>
        )}

        {projection?.minimumPermanentRecoveryEpoch && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
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
            onClick={() => void startOrRecoverTrial()}
            disabled={requestingTrial}
          >
            {requestingTrial && (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            {t("license.startOrRecoverTrial")}
          </Button>
        )}

        {permanentActivationAvailable && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Key className="me-1.5 h-4 w-4" aria-hidden="true" />
                {t("license.enterKey")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("license.activatePermanent")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 py-4">
                <Label htmlFor="license-entitlement">{t("license.licenseKey")}</Label>
                <Input
                  id="license-entitlement"
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  placeholder={t("license.pasteJsonPlaceholder")}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">{t("license.protectedBindingHelp")}</p>
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => void activate()} disabled={!keyInput.trim() || activating}>
                  {activating && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t("license.activate")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {error && !dialogOpen && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
