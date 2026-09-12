"use client";

import { useState } from "react";
import { AlertTriangle, Download, KeyRound, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { toast } from "@/lib/toast";
import { useShopStore } from "@/stores/shop-store";

type ApiPayload = { error?: string; code?: string };

export function DangerZonePanel({
  canExport,
  canReset,
}: {
  canExport: boolean;
  canReset: boolean;
}) {
  const { t, locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(locale, key);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  // The re-authentication gate is shared: both the reset and the full data
  // export are `requireRecentReauthentication()` actions server-side, so the
  // gate remembers WHICH action to resume after the PIN is verified.
  const [reauthAction, setReauthAction] = useState<
    "reset" | "privacyExport" | null
  >(null);
  const [exporting, setExporting] = useState(false);
  const [pin, setPin] = useState("");
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const shops = useShopStore((state) => state.shops);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const activeShop = shops.find((shop) => shop.id === activeShopId) ?? null;

  // F19: the type-to-confirm token is locale-neutral seller data — the shop's
  // own name, typeable on the seller's keyboard — instead of the Latin RESET.
  // The shipped-but-unnamed default shop keeps "RESET" (its real name is a
  // placeholder, not something the seller identifies with).
  const isDefaultShopPlaceholder =
    activeShop?.id === "default" && activeShop.name === "Ma Boutique";
  const shopToken =
    activeShop && !isDefaultShopPlaceholder ? activeShop.name.trim() : "";
  // An unnamed/whitespace shop name must not degenerate the gate into an
  // always-matching empty token — RESET stays the neutral fallback.
  const confirmToken = shopToken.length > 0 ? shopToken : "RESET";
  const confirmTextMatches =
    confirmText === confirmToken || confirmText === "RESET";

  async function handleReset(proofRefreshed = false) {
    if (!canReset) return;
    if (!confirmTextMatches) {
      toast.error(t("settings.dangerZone.typeReset", { token: confirmToken }));
      return;
    }
    setLoading(true);
    setReauthError(null);
    try {
      const response = await fetch("/api/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The wire contract is still the server's z.literal("RESET") token —
        // the shop-name token is a client-side locale-neutral gate that maps
        // onto it. If the backend batch moves the alias server-side, send the
        // typed token verbatim instead.
        body: JSON.stringify({ confirm: "RESET" }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      if (
        response.status === 403 &&
        payload.code === "REAUTHENTICATION_REQUIRED" &&
        !proofRefreshed
      ) {
        setReauthAction("reset");
        return;
      }
      if (!response.ok) {
        throw new Error(payload.error ?? t("settings.dangerZone.resetFailed"));
      }
      toast.success(t("settings.dangerZone.resetSuccess"));
      window.location.assign("/setup");
    } catch (error) {
      toast.error(
        translateServerError(
          error instanceof Error ? error.message : "",
          t,
          t("settings.dangerZone.resetFailed"),
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePrivacyExport(proofRefreshed = false) {
    if (!canExport || exporting) return;
    setExporting(true);
    setReauthError(null);
    try {
      const response = await fetch("/api/privacy/export", {
        method: "POST",
        cache: "no-store",
      });
      if (
        response.status === 403 &&
        !proofRefreshed
      ) {
        const payload = (await response
          .json()
          .catch(() => ({}))) as ApiPayload;
        if (payload.code === "REAUTHENTICATION_REQUIRED") {
          setReauthAction("privacyExport");
          return;
        }
        throw new Error(payload.error ?? copy("privacyExportFailed"));
      }
      if (!response.ok) {
        const payload = (await response
          .json()
          .catch(() => ({}))) as ApiPayload;
        throw new Error(payload.error ?? copy("privacyExportFailed"));
      }

      const blob = await response.blob();
      if (blob.size <= 0) throw new Error(copy("privacyExportFailed"));
      // Same download path the Inbox media attachments already ship, so it
      // behaves identically inside the packaged WebView.
      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = `sahelflow-privacy-export-${activeShop?.id ?? "shop"}.json`;
        anchor.rel = "noopener";
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      }
      toast.success(copy("privacyExportDone"));
    } catch (error) {
      toast.error(
        translateServerError(
          error instanceof Error ? error.message : "",
          t,
          copy("privacyExportFailed"),
        ),
      );
    } finally {
      setExporting(false);
    }
  }

  async function verifyPinAndResume() {
    if (!pin.trim() || reauthBusy) return;
    setReauthBusy(true);
    setReauthError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      if (!response.ok) {
        setReauthError(
          translateServerError(
            payload.error,
            t,
            copy("verificationDescription"),
          ),
        );
        return;
      }
      const resume = reauthAction;
      setReauthAction(null);
      setPin("");
      if (resume === "privacyExport") {
        await handlePrivacyExport(true);
      } else {
        await handleReset(true);
      }
    } catch {
      setReauthError(copy("unavailableDescription"));
    } finally {
      setReauthBusy(false);
    }
  }

  return (
    <Card className={canReset ? "border-destructive/30" : undefined}>
      <CardHeader>
        <CardTitle
          className={`flex items-center gap-2 ${canReset ? "text-destructive" : ""}`}
        >
          <AlertTriangle className="size-5" aria-hidden="true" />
          {t("settings.tabs.dangerZone")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {canExport ? (
          <div className="flex flex-col gap-4 rounded-surface border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{copy("ordersExport")}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {copy("ordersExportDescription")}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/export/orders">
                <Download className="size-4" aria-hidden="true" />
                {t("common.export")}
              </a>
            </Button>
          </div>
        ) : null}

        {canExport ? (
          <div className="flex flex-col gap-4 rounded-surface border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{copy("privacyExport")}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {copy("privacyExportDescription")}
              </p>
            </div>
            {/*
              `POST /api/privacy/export` builds the complete shop export
              (`createShopPrivacyExport`) behind trusted-action authority and a
              recent-re-authentication gate, and writes a
              `privacy.export.completed` audit entry. It had no caller anywhere
              in the product, so the only export a seller could reach was the
              orders CSV above. A POST cannot be a plain link, so the response
              is streamed to a blob and saved through the same download path
              the Inbox attachments already use.
            */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handlePrivacyExport()}
              disabled={exporting || reauthAction !== null}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-4" aria-hidden="true" />
              )}
              {exporting
                ? copy("privacyExportBusy")
                : copy("privacyExportAction")}
            </Button>
          </div>
        ) : null}

        {canReset ? (
          <div className="space-y-3 rounded-surface border border-destructive/30 bg-destructive-subtle p-4">
            <div>
              <p className="text-sm font-medium text-destructive">
                {t("settings.dangerZone.resetDatabase")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.dangerZone.resetWarning")}
              </p>
            </div>
            <div className="space-y-1.5">
              {/* IA-05: this Label carried no htmlFor and the Input no id, so
                  the two were never associated — on the one control that gates
                  a database reset. */}
              <Label htmlFor="danger-zone-confirm" className="text-xs">
                {t("settings.dangerZone.typeReset", { token: confirmToken })}
              </Label>
              <Input
                id="danger-zone-confirm"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={confirmToken}
                dir="auto"
                className="max-w-xs"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void handleReset()}
              disabled={loading || !confirmTextMatches || reauthAction !== null}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-4" aria-hidden="true" />
              )}
              {loading
                ? t("settings.dangerZone.resetting")
                : t("settings.dangerZone.resetEverything")}
            </Button>

          </div>
        ) : null}
          {reauthAction ? (
            <div className="space-y-3 rounded-surface border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4" aria-hidden="true" />
                {copy("verificationRequired")}
              </div>
              <p id="danger-zone-reauth-hint" className="text-xs leading-5 text-muted-foreground">
                {copy("verificationDescription")}
              </p>
              <Input
                type="password"
                inputMode="numeric"
                aria-describedby={reauthError ? "danger-zone-reauth-hint danger-zone-reauth-error" : "danger-zone-reauth-hint"}
                aria-invalid={reauthError ? true : undefined}
                autoComplete="current-password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                aria-label={copy("verificationRequired")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void verifyPinAndResume();
                }}
              />
              {reauthError ? (
                <p id="danger-zone-reauth-error" role="alert" className="text-xs text-destructive">
                  {reauthError}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void verifyPinAndResume()}
                  disabled={!pin.trim() || reauthBusy}
                >
                  {reauthBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {copy("verify")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setReauthAction(null);
                    setPin("");
                    setReauthError(null);
                  }}
                  disabled={reauthBusy}
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : null}
      </CardContent>
    </Card>
  );
}
