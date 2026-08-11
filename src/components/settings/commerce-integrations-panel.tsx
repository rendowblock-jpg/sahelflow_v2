"use client";

import { useRouter } from "next/navigation";
import type { ComponentType } from "react";
import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Plug,
} from "lucide-react";

import {
  GoogleSheetsIcon,
  ShopifyIcon,
  WooCommerceIcon,
  YouCanIcon,
} from "@/components/brand/brand-icons";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { toast } from "@/lib/toast";

interface CommerceDefinition {
  id: "youcan" | "shopify" | "woocommerce";
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
  iconContainerClassName: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "password";
    placeholder?: string;
  }>;
  docsUrl?: string;
}

type ApiResult = {
  error?: string;
  code?: string;
};

export function CommerceIntegrationsPanel({
  integrations,
  canManage,
  canSync,
}: {
  integrations: Array<{ platform: string; status: string }>;
  canManage: boolean;
  canSync: boolean;
}) {
  const { t, locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const router = useRouter();
  const copy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(locale, key);
  const [connecting, setConnecting] = useState<CommerceDefinition["id"] | null>(
    null,
  );
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [pin, setPin] = useState("");
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const definitions: CommerceDefinition[] = [
    {
      id: "youcan",
      name: "YouCan",
      description: t("integrations.youcanDesc"),
      icon: YouCanIcon,
      iconContainerClassName: "bg-emerald-500/10 dark:bg-emerald-500/15",
      iconClassName: "text-success",
      docsUrl: "https://partners.youcan.shop",
      fields: [
        {
          key: "accessToken",
          label: t("integrations.field.accessToken"),
          type: "password",
          placeholder: t("integrations.placeholder.youcanToken"),
        },
      ],
    },
    {
      id: "shopify",
      name: "Shopify",
      description: t("integrations.shopifyDesc"),
      icon: ShopifyIcon,
      iconContainerClassName: "bg-emerald-500/10 dark:bg-emerald-500/15",
      iconClassName: "text-success",
      fields: [
        {
          key: "shopDomain",
          label: t("integrations.field.shopDomain"),
          type: "text",
          placeholder: t("integrations.placeholder.shopifyDomain"),
        },
        {
          key: "accessToken",
          label: t("integrations.field.accessToken"),
          type: "password",
          placeholder: t("integrations.placeholder.shopifyToken"),
        },
      ],
    },
    {
      id: "woocommerce",
      name: "WooCommerce",
      description: t("integrations.woocommerceDesc"),
      icon: WooCommerceIcon,
      iconContainerClassName: "bg-violet-500/10 dark:bg-violet-500/15",
      iconClassName: "text-violet-600 dark:text-violet-400",
      fields: [
        {
          key: "siteUrl",
          label: t("integrations.field.siteUrl"),
          type: "text",
          placeholder: t("integrations.placeholder.wooSiteUrl"),
        },
        {
          key: "consumerKey",
          label: t("integrations.field.consumerKey"),
          type: "text",
          placeholder: t("integrations.placeholder.wooConsumerKey"),
        },
        {
          key: "consumerSecret",
          label: t("integrations.field.consumerSecret"),
          type: "password",
          placeholder: t("integrations.placeholder.wooConsumerSecret"),
        },
      ],
    },
  ];

  const connected = (provider: CommerceDefinition["id"]) =>
    integrations.some(
      (integration) =>
        integration.platform === provider && integration.status === "active",
    );

  const selected = definitions.find((definition) => definition.id === connecting);

  const resetDialog = () => {
    setConnecting(null);
    setFormData({});
    setReauthRequired(false);
    setPin("");
    setReauthError(null);
  };

  const openConfiguration = (provider: CommerceDefinition["id"]) => {
    if (!canManage) return;
    setConnecting(provider);
    setFormData({});
    setReauthRequired(false);
    setPin("");
    setReauthError(null);
  };

  const handleSave = async (proofRefreshed = false) => {
    if (!selected || !canManage) return;
    setSaving(true);
    setReauthError(null);
    try {
      const response = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected.id, ...formData }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiResult;
      if (
        response.status === 403 &&
        data.code === "REAUTHENTICATION_REQUIRED" &&
        !proofRefreshed
      ) {
        setReauthRequired(true);
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? t("common.connectionFailed"));
      }
      toast.success(
        t("integrations.connectedSuccess", { name: selected.name }),
      );
      resetDialog();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("integrations.connectFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  const verifyPinAndSave = async () => {
    if (!pin.trim()) return;
    setReauthBusy(true);
    setReauthError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiResult;
      if (!response.ok) {
        setReauthError(data.error ?? copy("reauthFailed"));
        return;
      }
      setReauthRequired(false);
      setPin("");
      await handleSave(true);
    } catch {
      setReauthError(copy("reauthFailed"));
    } finally {
      setReauthBusy(false);
    }
  };

  const handleSyncNow = async () => {
    if (!canSync) return;
    setSyncing(true);
    try {
      const response = await fetch("/api/integrations/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "sahelflow",
        },
        body: JSON.stringify({}),
      });
      const data = (await response.json().catch(() => null)) as {
        runs?: Array<{ id: string }>;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? t("integrations.syncFailed"));
      }
      const queued = Array.isArray(data?.runs) ? data.runs.length : 0;
      if (queued > 0) {
        toast.success(t("commerce.runtime.queueSuccess"));
      } else {
        toast.info(t("commerce.runtime.queueEmpty"));
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("integrations.syncFailed"),
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">{copy("commerce")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy("commerceDescription")}
          </p>
        </div>
        {canSync ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSyncNow()}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : null}
            {syncing ? t("integrations.syncing") : t("integrations.syncNow")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {definitions.map((definition) => {
            const Icon = definition.icon;
            const isConnected = connected(definition.id);
            return (
              <div
                key={definition.id}
                className="rounded-xl border bg-background/70 p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${definition.iconContainerClassName}`}
                  >
                    <Icon
                      className={`size-5 ${definition.iconClassName}`}
                      aria-hidden="true"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{definition.name}</p>
                      {isConnected ? (
                        <Badge variant="outline" className="text-success">
                          <CheckCircle2 className="size-3" aria-hidden="true" />
                          {t("integrations.connected")}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {definition.description}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canManage ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={isConnected ? "outline" : "default"}
                      onClick={() => openConfiguration(definition.id)}
                    >
                      <Plug className="size-3.5" aria-hidden="true" />
                      {isConnected
                        ? t("integrations.configure")
                        : t("integrations.connect")}
                    </Button>
                  ) : null}
                  {definition.docsUrl ? (
                    <Button asChild size="sm" variant="ghost">
                      <a
                        href={definition.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${definition.name} ${t("integrations.configure")}`}
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <GoogleSheetsIcon className="size-4 shrink-0" aria-hidden="true" />
          <span>{t("common.comingSoon")}: Google Sheets</span>
        </div>
      </CardContent>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) resetDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("integrations.connectTitle", { name: selected?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("integrations.connectDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selected?.fields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`commerce-${selected.id}-${field.key}`}>
                  {field.label}
                </Label>
                <Input
                  id={`commerce-${selected.id}-${field.key}`}
                  type={field.type}
                  value={formData[field.key] ?? ""}
                  onChange={(event) =>
                    setFormData((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  placeholder={field.placeholder}
                  autoComplete="off"
                  disabled={saving || reauthBusy}
                />
              </div>
            ))}

            {reauthRequired ? (
              <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <KeyRound className="size-4" aria-hidden="true" />
                  {copy("reauthTitle")}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {copy("reauthDescription")}
                </p>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder={copy("pinPlaceholder")}
                  aria-label={copy("pinPlaceholder")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void verifyPinAndSave();
                  }}
                />
                {reauthError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {reauthError}
                  </p>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void verifyPinAndSave()}
                  disabled={!pin.trim() || reauthBusy}
                >
                  {reauthBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  {copy("verify")}
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetDialog}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || reauthBusy || reauthRequired}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plug className="size-4" aria-hidden="true" />
              )}
              {t("integrations.connect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
