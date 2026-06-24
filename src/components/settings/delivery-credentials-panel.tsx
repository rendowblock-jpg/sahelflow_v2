"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Truck,
  CheckCircle2,
  Loader2,
  Trash2,
  Save,
} from "lucide-react";

interface ProviderStatus {
  [field: string]: boolean;
}

interface ProviderConfig {
  id: string;
  name: string;
  logo: string;
  fields: Array<{ key: string; label: string; type?: string }>;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: "yalidine",
    name: "Yalidine",
    logo: "📦",
    fields: [
      { key: "api_id", label: "API ID" },
      { key: "api_token", label: "API Token" },
    ],
  },
  {
    id: "maystro",
    name: "Maystro Delivery",
    logo: "🚚",
    fields: [{ key: "api_token", label: "API Token" }],
  },
  {
    id: "zrexpress",
    name: "ZR Express",
    logo: "📦",
    fields: [
      { key: "api_id", label: "API ID" },
      { key: "api_key", label: "API Key" },
    ],
  },
];

export function DeliveryCredentialsPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteProvider, setDeleteProvider] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch("/api/delivery/credentials");
      if (res.ok) {
        const data = (await res.json()) as { providers: Record<string, ProviderStatus> };
        setStatus(data.providers);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function startEditing(providerId: string) {
    setEditing(providerId);
    setValues({});
    setResult(null);
  }

  async function handleSave(providerId: string) {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/delivery/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerId, credentials: values }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (data.ok) {
        setResult({ ok: true, message: data.message ?? t("delivery.saved") });
        setEditing(null);
        await loadStatus();
      } else {
        setResult({ ok: false, message: data.error ?? t("delivery.failed") });
      }
    } catch {
      setResult({ ok: false, message: t("delivery.connectionFailed") });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(providerId: string) {
    setDeleteProvider(providerId);
  }

  async function performDelete() {
    if (!deleteProvider) return;
    try {
      await fetch(`/api/delivery/credentials?provider=${deleteProvider}`, { method: "DELETE" });
      await loadStatus();
    } catch {
      /* ignore */
    }
  }

  const isConfigured = (providerId: string): boolean => {
    const s = status[providerId];
    if (!s) return false;
    return Object.values(s).some((v) => v);
  };

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Truck className="h-5 w-5 text-primary" />
          </span>
          {t("delivery.providersTitle")}
        </CardTitle>
        <CardDescription>
          {t("delivery.providersDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          PROVIDER_CONFIGS.map((provider) => {
            const configured = isConfigured(provider.id);
            const isEditing = editing === provider.id;
            return (
              <div key={provider.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{provider.logo}</span>
                    <span className="font-medium">{provider.name}</span>
                  </div>
                  {configured ? (
                    <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {t("delivery.configured")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      {t("delivery.notConfigured")}
                    </Badge>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    {provider.fields.map((field) => (
                      <div key={field.key} className="space-y-1.5">
                        <Label htmlFor={`${provider.id}-${field.key}`}>{field.label}</Label>
                        <Input
                          id={`${provider.id}-${field.key}`}
                          type={field.type ?? "password"}
                          placeholder={field.label}
                          value={values[field.key] ?? ""}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [field.key]: e.target.value }))
                          }
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSave(provider.id)} disabled={saving}>
                        {saving ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-1.5" />
                        )}
                        {t("common.save")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEditing(provider.id)}>
                      {configured ? t("common.edit") : t("delivery.configureButton")}
                    </Button>
                    {configured && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(provider.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {t("common.delete")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}

        {result && (
          <div
            className={`flex items-center gap-2 rounded-md p-3 text-sm ${
              result.ok
                ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : null}
            <span>{result.message}</span>
          </div>
        )}
      </CardContent>
    </Card>
      <ConfirmDialog
        open={deleteProvider !== null}
        onOpenChange={(open) => { if (!open) setDeleteProvider(null); }}
        title={t("delivery.confirmDelete", { provider: deleteProvider ?? "" })}
        description={t("delivery.confirmDeleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={performDelete}
      />
    </>
  );
}
