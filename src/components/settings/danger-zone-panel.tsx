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
  const [reauthRequired, setReauthRequired] = useState(false);
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
        setReauthRequired(true);
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

  async function verifyPinAndReset() {
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
      setReauthRequired(false);
      setPin("");
      await handleReset(true);
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
          <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
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

        {canReset ? (
          <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div>
              <p className="text-sm font-medium text-destructive">
                {t("settings.dangerZone.resetDatabase")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("settings.dangerZone.resetWarning")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {t("settings.dangerZone.typeReset", { token: confirmToken })}
              </Label>
              <Input
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
              disabled={loading || !confirmTextMatches || reauthRequired}
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

            {reauthRequired ? (
              <div className="space-y-3 rounded-lg border bg-background p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4" aria-hidden="true" />
                  {copy("verificationRequired")}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {copy("verificationDescription")}
                </p>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  aria-label={copy("verificationRequired")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void verifyPinAndReset();
                  }}
                />
                {reauthError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {reauthError}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void verifyPinAndReset()}
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
                      setReauthRequired(false);
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
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
