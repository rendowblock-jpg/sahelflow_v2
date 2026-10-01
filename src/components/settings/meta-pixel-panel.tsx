"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import { BrandLogo } from "@/components/brand/brand-icons";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";

const CONVERSION_MODES = [
  "Purchase",
  "Purchase_Confirmed",
  "Purchase_Delivered",
  "Lead",
] as const;

type ConversionMode = (typeof CONVERSION_MODES)[number];

interface MetaPixelConfigDto {
  id: string;
  pixelId: string;
  adAccountName: string | null;
  conversionEvent: string;
  testMode: boolean;
  testEventCode: string | null;
  enabled: boolean;
}

type ApiBody = {
  ok?: boolean;
  config?: MetaPixelConfigDto | null;
  hasAccessToken?: boolean;
  message?: string;
  error?: string;
  code?: string;
};

/**
 * Meta Pixel + Conversions API settings surface (FD-061 EX-3). The access
 * token is write-only: the GET answers `hasAccessToken` and the token is
 * never echoed back. Events ride the desktop outbox — a Meta failure can
 * never block orders or deliveries.
 */
export function MetaPixelPanel() {
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = useCallback(
    (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
      getSettingsWorkspaceCopy(locale, key),
    [locale],
  );

  const [, setConfig] = useState<MetaPixelConfigDto | null>(null);
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [pixelId, setPixelId] = useState("");
  const [adAccountName, setAdAccountName] = useState("");
  const [conversionEvent, setConversionEvent] = useState<ConversionMode>("Purchase");
  const [testMode, setTestMode] = useState(false);
  const [testEventCode, setTestEventCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/meta-pixel");
      const body = (await response.json()) as ApiBody;
      if (!response.ok) throw new Error(body.error ?? "load_failed");
      setConfig(body.config ?? null);
      setHasAccessToken(Boolean(body.hasAccessToken));
      setPixelId(body.config?.pixelId ?? "");
      setAdAccountName(body.config?.adAccountName ?? "");
      setConversionEvent((body.config?.conversionEvent as ConversionMode) ?? "Purchase");
      setTestMode(Boolean(body.config?.testMode));
      setTestEventCode(body.config?.testEventCode ?? "");
      setEnabled(Boolean(body.config?.enabled));
    } catch {
      setError(copy("metaPixel.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/settings/meta-pixel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pixelId,
          adAccountName: adAccountName || null,
          conversionEvent,
          testMode,
          testEventCode: testEventCode || null,
          enabled,
          ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
        }),
      });
      const body = (await response.json()) as ApiBody;
      if (!response.ok) throw new Error(body.error ?? "save_failed");
      setConfig(body.config ?? null);
      setHasAccessToken(Boolean(body.hasAccessToken));
      setAccessToken("");
      setSaved(true);
    } catch {
      setError(copy("metaPixel.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [adAccountName, accessToken, conversionEvent, copy, enabled, pixelId, testEventCode, testMode]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BrandLogo id="meta" size="sm" />
          {copy("metaPixel.title")}
        </CardTitle>
        <CardDescription>{copy("metaPixel.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {copy("loading")}
          </div>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>{copy("metaPixel.failedTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {saved ? (
          <Alert>
            <CheckCircle2 className="size-4" aria-hidden />
            <AlertTitle>{copy("metaPixel.saved")}</AlertTitle>
            <AlertDescription>{copy("metaPixel.savedDescription")}</AlertDescription>
          </Alert>
        ) : null}
        {!loading ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="meta-pixel-id">{copy("metaPixel.pixelId")}</Label>
              <Input
                id="meta-pixel-id"
                value={pixelId}
                onChange={(event) => setPixelId(event.target.value)}
                placeholder="1234567890"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta-pixel-ad-account">{copy("metaPixel.adAccount")}</Label>
              <Input
                id="meta-pixel-ad-account"
                value={adAccountName}
                onChange={(event) => setAdAccountName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta-pixel-conversion">{copy("metaPixel.conversionEvent")}</Label>
              <Select
                value={conversionEvent}
                onValueChange={(value) => setConversionEvent(value as ConversionMode)}
              >
                <SelectTrigger id="meta-pixel-conversion">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONVERSION_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{copy("metaPixel.conversionHint")}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="meta-pixel-token">
                {hasAccessToken
                  ? copy("metaPixel.tokenStored")
                  : copy("metaPixel.token")}
              </Label>
              <Input
                id="meta-pixel-token"
                type="password"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder={hasAccessToken ? "••••••••" : "EAAG..."}
                autoComplete="new-password"
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="meta-pixel-test-mode">{copy("metaPixel.testMode")}</Label>
                <Switch
                  id="meta-pixel-test-mode"
                  checked={testMode}
                  onCheckedChange={setTestMode}
                />
              </div>
              {testMode ? (
                <div className="grid gap-2">
                  <Label htmlFor="meta-pixel-test-code">{copy("metaPixel.testEventCode")}</Label>
                  <Input
                    id="meta-pixel-test-code"
                    value={testEventCode}
                    onChange={(event) => setTestEventCode(event.target.value)}
                    autoComplete="off"
                  />
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="meta-pixel-enabled">{copy("metaPixel.enabled")}</Label>
              <Switch
                id="meta-pixel-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
            <div>
              <Button onClick={() => void save()} disabled={saving || pixelId.trim().length === 0}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-4" aria-hidden />
                )}
                {copy("metaPixel.save")}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
