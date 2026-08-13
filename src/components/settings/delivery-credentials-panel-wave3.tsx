"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { useI18n } from "@/hooks/use-i18n";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";

type ProviderId = "yalidine" | "maystro" | "zrexpress" | "ecotrack";
type ProviderStatus = Record<string, boolean>;
type Certification = {
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
};
type ProviderConfig = {
  id: ProviderId;
  credentialRouteId: ProviderId;
  name: string;
  fields: Array<{ key: string; label: string; type?: "text" | "password" }>;
};
type ApiBody = {
  ok?: boolean;
  message?: string;
  error?: string;
  code?: string;
  providers?: Record<string, ProviderStatus>;
  certifications?: Certification[];
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "yalidine",
    credentialRouteId: "yalidine",
    name: "Yalidine",
    fields: [
      { key: "apiId", label: "API ID" },
      { key: "apiToken", label: "API Token" },
    ],
  },
  {
    id: "maystro",
    credentialRouteId: "maystro",
    name: "Maystro Delivery",
    fields: [{ key: "apiToken", label: "API Token" }],
  },
  {
    id: "zrexpress",
    credentialRouteId: "zrexpress",
    name: "ZR Express",
    fields: [
      { key: "apiId", label: "API ID" },
      { key: "apiKey", label: "API Key" },
    ],
  },
  {
    id: "ecotrack",
    credentialRouteId: "ecotrack",
    name: "EcoTrack Pro",
    fields: [
      { key: "carrierName", label: "Courier name", type: "text" },
      { key: "apiToken", label: "API Token" },
      { key: "userGuid", label: "User GUID" },
      { key: "createOrderUrl", label: "Create-order URL", type: "text" },
      { key: "validateOrderUrl", label: "Validate-order URL", type: "text" },
      { key: "trackingsUrl", label: "Trackings URL", type: "text" },
      { key: "feesUrl", label: "Fees URL", type: "text" },
    ],
  },
];

function requiresReauthentication(response: Response, body: ApiBody): boolean {
  return response.status === 403 && body.code === "REAUTHENTICATION_REQUIRED";
}

export function DeliveryCredentialsPanelWave3() {
  const { t, locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(locale, key);
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [certifications, setCertifications] = useState<Record<string, Certification>>({});
  const [state, setState] = useState<"loading" | "ready" | "verification" | "unavailable">("loading");
  const [editing, setEditing] = useState<ProviderId | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteProvider, setDeleteProvider] = useState<ProviderConfig | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pin, setPin] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/delivery/credentials", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      if (requiresReauthentication(response, body)) {
        setState("verification");
        return;
      }
      if (!response.ok || !body.providers) throw new Error();
      setStatus(body.providers);
      setCertifications(
        Object.fromEntries((body.certifications ?? []).map((item) => [item.provider, item])),
      );
      setState("ready");
    } catch {
      setState("unavailable");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function reauthenticate() {
    if (!pin.trim()) return;
    setBusy("reauth");
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) throw new Error(copy("verificationDescription"));
      setPin("");
      await load();
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : copy("unavailableDescription"),
      });
    } finally {
      setBusy(null);
    }
  }

  async function save(provider: ProviderConfig) {
    setBusy(`save:${provider.id}`);
    setResult(null);
    try {
      const response = await fetch("/api/delivery/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider.credentialRouteId,
          credentials: values,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      if (requiresReauthentication(response, body)) {
        setState("verification");
        return;
      }
      if (!response.ok || !body.ok) throw new Error(body.error ?? t("delivery.failed"));
      setEditing(null);
      setValues({});
      setResult({ ok: true, message: body.message ?? t("delivery.saved") });
      await load();
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : t("delivery.connectionFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function certify(provider: ProviderConfig) {
    setBusy(`certify:${provider.id}`);
    setResult(null);
    try {
      const response = await fetch("/api/delivery/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, reasonCode: "settings_manual_certification" }),
      });
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      setResult({ ok: response.ok && body.ok === true, message: body.message ?? body.error ?? t("integrations.testFailed") });
      await load();
    } catch {
      setResult({ ok: false, message: t("delivery.connectionFailed") });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!deleteProvider) return;
    const provider = deleteProvider;
    setDeleteProvider(null);
    setBusy(`delete:${provider.id}`);
    try {
      const response = await fetch(
        `/api/delivery/credentials?provider=${encodeURIComponent(provider.credentialRouteId)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => ({}))) as ApiBody;
      if (!response.ok || !body.ok) throw new Error(body.error ?? t("delivery.failed"));
      setResult({ ok: true, message: body.message ?? t("delivery.saved") });
      await load();
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : t("delivery.connectionFailed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="size-5 text-primary" aria-hidden="true" />
            {t("delivery.providersTitle")}
          </CardTitle>
          <CardDescription>{t("delivery.providersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" ? <p className="text-sm text-muted-foreground">{copy("loading")}</p> : null}
          {state === "verification" ? (
            <Alert>
              <ShieldCheck className="size-4" aria-hidden="true" />
              <AlertTitle>{copy("verificationRequired")}</AlertTitle>
              <AlertDescription className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" />
                <Button onClick={() => void reauthenticate()} disabled={!pin.trim() || busy === "reauth"}>
                  {busy === "reauth" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {copy("verify")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {state === "unavailable" ? (
            <Alert>
              <AlertTriangle className="size-4" aria-hidden="true" />
              <AlertTitle>{copy("unavailable")}</AlertTitle>
              <AlertDescription>
                {copy("unavailableDescription")}
                <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>{copy("retry")}</Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {state === "ready" ? PROVIDERS.map((provider) => {
            const configured = Object.values(status[provider.id] ?? {}).some(Boolean);
            const certified = certifications[provider.id]?.capabilities.connection?.status === "certified";
            const isEditing = editing === provider.id;
            return (
              <section key={provider.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">{provider.name}</p>
                  <div className="flex gap-2">
                    {certified ? <Badge><ShieldCheck className="me-1 size-3" aria-hidden="true" />{t("delivery.certified")}</Badge> : null}
                    <Badge variant={configured ? "default" : "outline"}>
                      {configured ? t("delivery.configured") : t("delivery.notConfigured")}
                    </Badge>
                  </div>
                </div>

                {isEditing ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {provider.fields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={`${provider.id}-${field.key}`}>{field.label}</Label>
                        <Input
                          id={`${provider.id}-${field.key}`}
                          type={field.type ?? "password"}
                          value={values[field.key] ?? ""}
                          onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 md:col-span-2">
                      <Button size="sm" onClick={() => void save(provider)} disabled={busy !== null}>
                        <Save className="size-4" aria-hidden="true" />{t("common.save")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(provider.id); setValues({}); setResult(null); }}>
                      {configured ? t("common.edit") : t("delivery.configureButton")}
                    </Button>
                    {configured ? (
                      <Button size="sm" variant="outline" onClick={() => void certify(provider)} disabled={busy !== null}>
                        <ShieldCheck className="size-4" aria-hidden="true" />{t("integrations.testConnection")}
                      </Button>
                    ) : null}
                    {configured ? (
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteProvider(provider)}>
                        <Trash2 className="size-4" aria-hidden="true" />{t("common.delete")}
                      </Button>
                    ) : null}
                  </div>
                )}
              </section>
            );
          }) : null}

          {result ? (
            <div role={result.ok ? "status" : "alert"} className={result.ok ? "flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm text-success" : "rounded-md bg-destructive/10 p-3 text-sm text-destructive"}>
              {result.ok ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}{result.message}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteProvider !== null}
        onOpenChange={(open) => { if (!open) setDeleteProvider(null); }}
        title={t("delivery.confirmDelete", { provider: deleteProvider?.name ?? "" })}
        description={t("delivery.confirmDeleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={remove}
      />
    </>
  );
}
