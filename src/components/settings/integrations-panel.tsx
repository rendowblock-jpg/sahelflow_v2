"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, CheckCircle2, Plug, ExternalLink } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import { CommerceSyncRecoveryPanel } from "@/components/settings/commerce-sync-recovery-panel";
import {
  ShopifyIcon,
  WooCommerceIcon,
  YouCanIcon,
  WhatsAppIcon,
  GeminiIcon,
  YalidineIcon,
  MaystroIcon,
  ZRExpressIcon,
  NoestIcon,
  GoogleSheetsIcon,
} from "@/components/brand/brand-icons";

interface Integration {
  id: string;
  name: string;
  description: string;
  category: "ecommerce" | "delivery" | "messaging" | "ai" | "productivity";
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  connected: boolean;
  connectLabel: string;
  connectUrl?: string;
  docsUrl?: string;
  /** Fields needed to connect (for the dialog) */
  fields?: Array<{
    key: string;
    label: string;
    type: "text" | "password";
    placeholder?: string;
  }>;
  /** API endpoint to save credentials (POST with JSON body) */
  saveEndpoint?: string;
}

export function IntegrationsPanel({
  integrations,
}: {
  integrations: Array<{ platform: string; status: string }>;
}) {
  const { t } = useI18n();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // W2-10: track "Test connection" loading state per integration id.
  const [testing, setTesting] = useState<string | null>(null);

  const integrationList: Integration[] = [
    // E-commerce
    {
      id: "youcan",
      name: "YouCan",
      description: t("integrations.youcanDesc"),
      category: "ecommerce",
      icon: YouCanIcon,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      iconColor: "text-success",
      connected: integrations.some(
        (i) => i.platform === "youcan" && i.status === "active",
      ),
      connectLabel: t("integrations.connect"),
      docsUrl: "https://partners.youcan.shop",
      fields: [
        {
          key: "accessToken",
          label: t("integrations.field.accessToken"),
          type: "password",
          placeholder: t("integrations.placeholder.youcanToken"),
        },
      ],
      saveEndpoint: "/api/integrations/connect",
    },
    {
      id: "shopify",
      name: "Shopify",
      description: t("integrations.shopifyDesc"),
      category: "ecommerce",
      icon: ShopifyIcon,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      iconColor: "text-success",
      connected: integrations.some(
        (i) => i.platform === "shopify" && i.status === "active",
      ),
      connectLabel: t("integrations.connect"),
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
      saveEndpoint: "/api/integrations/connect",
    },
    {
      id: "woocommerce",
      name: "WooCommerce",
      description: t("integrations.woocommerceDesc"),
      category: "ecommerce",
      icon: WooCommerceIcon,
      iconBg: "bg-violet-500/10 dark:bg-violet-500/15",
      iconColor: "text-violet-600 dark:text-violet-400",
      connected: integrations.some(
        (i) => i.platform === "woocommerce" && i.status === "active",
      ),
      connectLabel: t("integrations.connect"),
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
      saveEndpoint: "/api/integrations/connect",
    },
    // Delivery
    {
      id: "noest",
      name: "NOEST Express",
      description: t("integrations.noestDesc"),
      category: "delivery",
      icon: NoestIcon,
      iconBg: "bg-sky-500/10 dark:bg-sky-500/15",
      iconColor: "text-sky-600 dark:text-sky-400",
      connected: false,
      connectLabel: t("integrations.connect"),
      fields: [
        {
          key: "apiToken",
          label: t("integrations.field.apiToken"),
          type: "password",
          placeholder: t("integrations.placeholder.noestToken"),
        },
        {
          key: "userGuid",
          label: t("integrations.field.userGuid"),
          type: "text",
          placeholder: t("integrations.placeholder.noestUserGuid"),
        },
        {
          key: "createOrderUrl",
          label: t("integrations.field.createOrderUrl"),
          type: "text",
          placeholder: t("integrations.placeholder.noestCreateUrl"),
        },
        {
          key: "validateOrderUrl",
          label: t("integrations.field.validateOrderUrl"),
          type: "text",
          placeholder: t("integrations.placeholder.noestValidateUrl"),
        },
        {
          key: "trackingsUrl",
          label: t("integrations.field.trackingsUrl"),
          type: "text",
          placeholder: t("integrations.placeholder.noestTrackingsUrl"),
        },
        {
          key: "feesUrl",
          label: t("integrations.field.feesUrl"),
          type: "text",
          placeholder: t("integrations.placeholder.noestFeesUrl"),
        },
      ],
      saveEndpoint: "/api/delivery/credentials",
    },
    {
      id: "zrexpress",
      name: "ZR Express",
      description: t("integrations.zrExpressDesc"),
      category: "delivery",
      icon: ZRExpressIcon,
      iconBg: "bg-teal-500/10 dark:bg-teal-500/15",
      iconColor: "text-teal-600 dark:text-teal-400",
      connected: false,
      connectLabel: t("integrations.connect"),
      fields: [
        {
          key: "apiId",
          label: t("integrations.field.apiId"),
          type: "text",
          placeholder: t("integrations.placeholder.zrApiId"),
        },
        {
          key: "apiKey",
          label: t("integrations.field.apiKey"),
          type: "password",
          placeholder: t("integrations.placeholder.zrApiKey"),
        },
      ],
      saveEndpoint: "/api/delivery/credentials",
    },
    {
      id: "yalidine",
      name: "Yalidine",
      description: t("integrations.yalidineDesc"),
      category: "delivery",
      icon: YalidineIcon,
      iconBg: "bg-orange-500/10 dark:bg-orange-500/15",
      iconColor: "text-orange-600 dark:text-orange-400",
      connected: false,
      connectLabel: t("integrations.connect"),
      fields: [
        {
          key: "apiId",
          label: t("integrations.field.apiId"),
          type: "text",
          placeholder: t("integrations.placeholder.yalidineApiId"),
        },
        {
          key: "apiToken",
          label: t("integrations.field.apiToken"),
          type: "password",
          placeholder: t("integrations.placeholder.yalidineApiToken"),
        },
      ],
      saveEndpoint: "/api/delivery/credentials",
    },
    {
      id: "maystro",
      name: "Maystro Delivery",
      description: t("integrations.maystroDesc"),
      category: "delivery",
      icon: MaystroIcon,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      iconColor: "text-success dark:text-teal-400",
      connected: false,
      connectLabel: t("integrations.connect"),
      fields: [
        {
          key: "apiToken",
          label: t("integrations.field.apiToken"),
          type: "password",
          placeholder: t("integrations.placeholder.maystroApiToken"),
        },
      ],
      saveEndpoint: "/api/delivery/credentials",
    },
    // Messaging
    {
      id: "whatsapp",
      name: "WhatsApp",
      description: t("integrations.whatsappDesc"),
      category: "messaging",
      icon: WhatsAppIcon,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      iconColor: "text-success",
      connected: false, // checked via WhatsApp status API
      connectLabel: t("integrations.connect"),
      connectUrl: "/inbox",
    },
    // AI
    {
      id: "gemini",
      name: "Google Gemini",
      description: t("integrations.geminiDesc"),
      category: "ai",
      icon: GeminiIcon,
      iconBg: "bg-teal-500/10 dark:bg-teal-500/15",
      iconColor: "text-teal-600 dark:text-teal-400",
      connected: false, // checked via secrets API
      connectLabel: t("integrations.configure"),
      connectUrl: "/settings",
      docsUrl: "https://aistudio.google.com/apikey",
    },
    // Productivity (Google Sheets is server-configured via env vars;
    // there is no API to save credentials from the UI, so it's listed
    // in the "coming soon" note below instead of as a connectable card.)
  ];

  const categories = [
    { id: "ecommerce", label: t("integrations.categoryEcommerce") },
    { id: "delivery", label: t("integrations.categoryDelivery") },
    { id: "messaging", label: t("integrations.categoryMessaging") },
    { id: "ai", label: t("integrations.categoryAI") },
    { id: "productivity", label: t("integrations.categoryProductivity") },
  ] as const;

  const handleConnect = (integration: Integration) => {
    if (integration.connectUrl) {
      window.location.assign(integration.connectUrl);
      return;
    }
    if (integration.fields && integration.saveEndpoint) {
      setConnecting(integration.id);
      setFormData({});
      setDialogOpen(true);
    }
  };

  // Queue a durable sync run. The request returns after persistence; provider
  // pages and canonical order mutations remain worker-owned and restart-safe.
  const [syncing, setSyncing] = useState(false);
  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "sahelflow",
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => null)) as {
        runs?: Array<{ id: string }>;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "Sync queue failed");
      const queued = Array.isArray(data?.runs) ? data.runs.length : 0;
      if (queued > 0) {
        toast.success(t("commerce.runtime.queueSuccess"));
      } else {
        toast.error(t("commerce.runtime.queueEmpty"));
      }
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("integrations.syncFailed"),
      );
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    if (!connecting) return;
    setSaving(true);
    try {
      const integration = integrationList.find((i) => i.id === connecting);
      if (!integration?.saveEndpoint) return;

      // The delivery credentials API expects { provider, credentials: {...} }
      // The e-commerce connect API expects { provider, ...fields flat }
      const isDelivery =
        integration.saveEndpoint === "/api/delivery/credentials";
      const body: Record<string, unknown> = { provider: connecting };
      if (isDelivery) {
        body.credentials = { ...formData };
      } else {
        for (const [k, v] of Object.entries(formData)) {
          body[k] = v;
        }
      }

      const res = await fetch(integration.saveEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("common.connectionFailed"));

      toast.success(
        t("integrations.connectedSuccess", { name: integration.name }),
      );
      setDialogOpen(false);
      setConnecting(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("integrations.connectFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  // Validate provider credentials without creating a shipment. NOEST uses
  // its provider-issued fees endpoint, so no guessed host or path is trusted.
  const handleTestConnection = async (integration: Integration) => {
    setTesting(integration.id);
    try {
      const res = await fetch("/api/delivery/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: integration.id,
          reasonCode: "settings_manual_certification",
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: string;
      } | null;
      const message =
        data?.message ?? data?.error ?? t("integrations.testFailed");
      if (res.ok && data?.ok) {
        toast.success(t("integrations.testSuccess"), { description: message });
      } else {
        toast.error(t("integrations.testFailed"), { description: message });
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("integrations.testFailed"),
      );
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-end mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={syncing}
          >
            {syncing ? t("integrations.syncing") : t("integrations.syncNow")}
          </Button>
        </div>

        <h2 className="text-lg font-semibold">
          {t("settings.tab.integrations")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("integrations.subtitle")}
        </p>
      </div>

      <CommerceSyncRecoveryPanel />

      {categories.map((category) => {
        const items = integrationList.filter((i) => i.category === category.id);
        if (items.length === 0) return null;
        return (
          <div key={category.id} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {category.label}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((integration) => {
                const Icon = integration.icon;
                // W2-10: delivery cards get a "Test connection" button.
                const isDelivery =
                  integration.saveEndpoint === "/api/delivery/credentials";
                const isTesting = testing === integration.id;
                return (
                  <Card
                    key={integration.id}
                    className="shadow-xs hover:shadow-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${integration.iconBg}`}
                        >
                          <Icon
                            className={`h-5 w-5 ${integration.iconColor}`}
                          />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm">
                              {integration.name}
                            </p>
                            {integration.connected && (
                              <Badge
                                variant="outline"
                                className="text-success border-emerald-500/20 text-xs px-1.5"
                              >
                                <CheckCircle2 className="me-1 h-3 w-3" />
                                {t("integrations.connected")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {integration.description}
                          </p>
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <Button
                              size="sm"
                              variant={
                                integration.connected ? "outline" : "default"
                              }
                              onClick={() => handleConnect(integration)}
                              disabled={integration.connected}
                            >
                              {!integration.connected && (
                                <Plug className="me-1.5 h-3.5 w-3.5" />
                              )}
                              {integration.connected
                                ? t("integrations.connected")
                                : integration.connectLabel}
                            </Button>
                            {isDelivery && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleTestConnection(integration)
                                }
                                disabled={isTesting}
                                title={t("integrations.testConnectionHint")}
                              >
                                {isTesting ? (
                                  <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : null}
                                {isTesting
                                  ? t("integrations.testing")
                                  : t("integrations.testConnection")}
                              </Button>
                            )}
                            {integration.docsUrl && (
                              <Button size="sm" variant="ghost" asChild>
                                <a
                                  href={integration.docsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Coming soon note for integrations that have no UI-wired connect flow */}
      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
        <div className="flex items-center gap-2">
          <GoogleSheetsIcon className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t("common.comingSoon")}: Google Sheets
          </p>
        </div>
      </div>

      {/* Connect dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setConnecting(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("integrations.connectTitle", {
                name:
                  integrationList.find((i) => i.id === connecting)?.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("integrations.connectDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {connecting &&
              integrationList
                .find((i) => i.id === connecting)
                ?.fields?.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Input
                      id={field.key}
                      type={field.type}
                      value={formData[field.key] ?? ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      autoComplete="off"
                    />
                  </div>
                ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setConnecting(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <Plug className="me-2 h-4 w-4" />
              )}
              {t("integrations.connect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
