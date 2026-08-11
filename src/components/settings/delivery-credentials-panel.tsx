"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";

interface ProviderStatus {
  [field: string]: boolean;
}

interface CertificationStatus {
  provider: string;
  capabilities: {
    connection?: {
      status: string;
      expiresAt: string | null;
      lastCheckedAt: string | null;
      reasonCode: string | null;
      lastErrorCode: string | null;
    };
  };
}

interface ProviderConfig {
  id: "yalidine" | "maystro" | "zrexpress" | "noest";
  name: string;
  logo: string;
  fields: Array<{ key: string; label: string; type?: string }>;
}

type AuthorityState = "loading" | "ready" | "verification-required" | "unavailable";
type ApiBody = {
  ok?: boolean;
  message?: string;
  error?: string;
  code?: string;
  providers?: Record<string, ProviderStatus>;
  certifications?: CertificationStatus[];
};

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: "yalidine",
    name: "Yalidine",
    logo: "📦",
    fields: [
      { key: "apiId", label: "API ID" },
      { key: "apiToken", label: "API Token" },
    ],
  },
  {
    id: "maystro",
    name: "Maystro Delivery",
    logo: "🚚",
    fields: [{ key: "apiToken", label: "API Token" }],
  },
  {
    id: "zrexpress",
    name: "ZR Express",
    logo: "📦",
    fields: [
      { key: "apiId", label: "API ID" },
      { key: "apiKey", label: "API Key" },
    ],
  },
  {
    id: "noest",
    name: "NOEST Express",
    logo: "🚚",
    fields: [
      { key: "apiToken", label: "API Token" },
      { key: "userGuid", label: "User GUID" },
      { key: "createOrderUrl", label: "Create-order URL" },
      { key: "validateOrderUrl", label: "Validate-order URL" },
      { key: "trackingsUrl", label: "Trackings URL" },
      { key: "feesUrl", label: "Fees URL" },
    ],
  },
];

function requiresReauthentication(response: Response, body: ApiBody): boolean {
  return response.status === 403 && body.code === "REAUTHENTICATION_REQUIRED";
}

export function DeliveryCredentialsPanel() {
  const { t, locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(locale, key);
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [certifications, setCertifications] = useState<
    Record<string, CertificationStatus>
  >({});
  const [authorityState, setAuthorityState] = useState<AuthorityState>("loading");
  const [editing, setEditing] = useState<ProviderConfig["id"] | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [certifying, setCertifying] = useState<string | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<ProviderConfig["id"] | null>(
    null,
  );
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [pin, setPin] = useState("");
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setAuthorityState("loading");
    setReauthError(null);
    try {
      const response = await fetch("/api/delivery/credentials", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      if (requiresReauthentication(response, body)) {
        setAuthorityState("verification-required");
        return;
      }
      if (!response.ok || !body.providers) {
        throw new Error(body.error ?? t("common.fetchFailed"));
      }
      setStatus(body.providers);
      setCertifications(
        Object.fromEntries(
          (body.certifications ?? []).map((item) => [item.provider, item]),
        ),
      );
      setAuthorityState("ready");
    } catch {
      setAuthorityState("unavailable");
    }
  }, [t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadStatus();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadStatus]);

  const verifyPin = async () => {
    if (!pin.trim() || reauthBusy) return;
    setReauthBusy(true);
    setReauthError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      if (!response.ok) {
        setReauthError(body.error ?? copy("verificationDescription"));
        return;
      }
      setPin("");
      await loadStatus();
    } catch {
      setReauthError(copy("unavailableDescription"));
    } finally {
      setReauthBusy(false);
    }
  };

  function startEditing(providerId: ProviderConfig["id"]) {
    setEditing(providerId);
    setValues({});
    setResult(null);
  }

  async function handleSave(providerId: ProviderConfig["id"]) {
    setSaving(true);
    setResult(null);
    try {
      const response = await fetch("/api/delivery/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, credentials: values }),
      });
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      if (requiresReauthentication(response, body)) {
        setAuthorityState("verification-required");
        return;
      }
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? t("delivery.failed"));
      }
      setResult({ ok: true, message: body.message ?? t("delivery.saved") });
      setEditing(null);
      setValues({});
      await loadStatus();
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error ? error.message : t("delivery.connectionFailed"),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCertify(providerId: ProviderConfig["id"]) {
    setCertifying(providerId);
    setResult(null);
    try {
      const response = await fetch("/api/delivery/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: providerId,
          reasonCode: "settings_manual_certification",
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      setResult({
        ok: response.ok && body.ok === true,
        message:
          body.message ?? body.error ?? t("integrations.testFailed"),
      });
      await loadStatus();
    } catch {
      setResult({ ok: false, message: t("delivery.connectionFailed") });
    } finally {
      setCertifying(null);
    }
  }

  async function performDelete() {
    if (!deleteProvider) return;
    setResult(null);
    try {
      const response = await fetch(
        `/api/delivery/credentials?provider=${encodeURIComponent(deleteProvider)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      if (requiresReauthentication(response, body)) {
        setAuthorityState("verification-required");
        return;
      }
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? t("delivery.failed"));
      }
      setResult({ ok: true, message: body.message ?? t("delivery.saved") });
      await loadStatus();
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error ? error.message : t("delivery.connectionFailed"),
      });
    }
  }

  const isConfigured = (providerId: ProviderConfig["id"]): boolean => {
    const providerStatus = status[providerId];
    return providerStatus ? Object.values(providerStatus).some(Boolean) : false;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10">
              <Truck className="size-5 text-primary" aria-hidden="true" />
            </span>
            {t("delivery.providersTitle")}
          </CardTitle>
          <CardDescription>{t("delivery.providersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {authorityState === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {copy("loading")}
            </div>
          ) : null}

          {authorityState === "verification-required" ? (
            <Alert>
              <ShieldCheck className="size-4" />
              <AlertTitle>{copy("verificationRequired")}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {copy("verificationDescription")}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    placeholder={t("auth.pinPlaceholder")}
                    autoComplete="current-password"
                    disabled={reauthBusy}
                  />
                  <Button
                    type="button"
                    onClick={() => void verifyPin()}
                    disabled={reauthBusy || !pin.trim()}
                  >
                    {reauthBusy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {copy("verify")}
                  </Button>
                </div>
                {reauthError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {reauthError}
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          {authorityState === "unavailable" ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>{copy("unavailable")}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {copy("unavailableDescription")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadStatus()}
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  {copy("retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {authorityState === "ready"
            ? PROVIDER_CONFIGS.map((provider) => {
                const configured = isConfigured(provider.id);
                const isEditing = editing === provider.id;
                const certification =
                  certifications[provider.id]?.capabilities.connection;
                const certified = certification?.status === "certified";
                return (
                  <div
                    key={provider.id}
                    className="space-y-3 rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg" aria-hidden="true">
                          {provider.logo}
                        </span>
                        <span className="font-medium">{provider.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {certified ? (
                          <Badge className="gap-1 border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                            <ShieldCheck className="size-3" aria-hidden="true" />
                            {t("delivery.certified")}
                          </Badge>
                        ) : null}
                        {configured ? (
                          <Badge className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-success dark:text-emerald-400">
                            <CheckCircle2 className="size-3" aria-hidden="true" />
                            {t("delivery.configured")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-300 text-warning dark:border-amber-700"
                          >
                            {t("delivery.notConfigured")}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        {provider.fields.map((field) => (
                          <div key={field.key} className="space-y-1.5">
                            <Label htmlFor={`${provider.id}-${field.key}`}>
                              {field.label}
                            </Label>
                            <Input
                              id={`${provider.id}-${field.key}`}
                              type={field.type ?? "password"}
                              placeholder={field.label}
                              value={values[field.key] ?? ""}
                              onChange={(event) =>
                                setValues((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                              autoComplete="off"
                              spellCheck={false}
                            />
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleSave(provider.id)}
                            disabled={saving}
                          >
                            {saving ? (
                              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Save className="size-4" aria-hidden="true" />
                            )}
                            {t("common.save")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(null)}
                          >
                            {t("common.cancel")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => startEditing(provider.id)}
                        >
                          {configured
                            ? t("common.edit")
                            : t("delivery.configureButton")}
                        </Button>
                        {configured ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void handleCertify(provider.id)}
                            disabled={certifying === provider.id}
                          >
                            {certifying === provider.id ? (
                              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                            ) : (
                              <ShieldCheck className="size-3" aria-hidden="true" />
                            )}
                            {t("integrations.testConnection")}
                          </Button>
                        ) : null}
                        {configured ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteProvider(provider.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="size-3" aria-hidden="true" />
                            {t("common.delete")}
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })
            : null}

          {result ? (
            <div
              role={result.ok ? "status" : "alert"}
              className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                result.ok
                  ? "bg-success/10 text-success dark:bg-success/15"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              ) : null}
              <span>{result.message}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteProvider !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteProvider(null);
        }}
        title={t("delivery.confirmDelete", {
          provider: deleteProvider ?? "",
        })}
        description={t("delivery.confirmDeleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={performDelete}
      />
    </>
  );
}
