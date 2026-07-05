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
import { toast } from "sonner";
import {
  ShopifyIcon,
  WooCommerceIcon,
  YouCanIcon,
  WhatsAppIcon,
  GeminiIcon,
  YalidineIcon,
  MaystroIcon,
  ZRExpressIcon,
  DHDIcon,
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
  fields?: Array<{ key: string; label: string; type: "text" | "password"; placeholder?: string }>;
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

  const integrationList: Integration[] = [
    // E-commerce
    {
      id: "youcan",
      name: "YouCan",
      description: t("integrations.youcanDesc"),
      category: "ecommerce",
      icon: YouCanIcon,
      iconBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      connected: integrations.some((i) => i.platform === "youcan" && i.status === "active"),
      connectLabel: t("integrations.connect"),
      docsUrl: "https://partners.youcan.shop",
      fields: [
        { key: "accessToken", label: "Access Token", type: "password", placeholder: "yc_..." },
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
      iconColor: "text-emerald-600 dark:text-emerald-400",
      connected: integrations.some((i) => i.platform === "shopify" && i.status === "active"),
      connectLabel: t("integrations.connect"),
      fields: [
        { key: "shopDomain", label: "Shop Domain", type: "text", placeholder: "my-store.myshopify.com" },
        { key: "accessToken", label: "Access Token", type: "password", placeholder: "shpat_..." },
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
      connected: integrations.some((i) => i.platform === "woocommerce" && i.status === "active"),
      connectLabel: t("integrations.connect"),
      fields: [
        { key: "siteUrl", label: "Site URL", type: "text", placeholder: "https://my-store.com" },
        { key: "consumerKey", label: "Consumer Key", type: "text", placeholder: "ck_..." },
        { key: "consumerSecret", label: "Consumer Secret", type: "password", placeholder: "cs_..." },
      ],
      saveEndpoint: "/api/integrations/connect",
    },
    // Delivery
    {
      id: "dhd",
      name: "DHD Delivery",
      description: t("integrations.dhdDesc"),
      category: "delivery",
      icon: DHDIcon,
      iconBg: "bg-rose-500/10 dark:bg-rose-500/15",
      iconColor: "text-rose-600 dark:text-rose-400",
      connected: false, // checked via delivery credentials API
      connectLabel: t("integrations.connect"),
      fields: [
        { key: "apiToken", label: "API Token", type: "password", placeholder: "Enter DHD API token" },
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
        { key: "apiId", label: "API ID", type: "text", placeholder: "ZR Express API ID" },
        { key: "apiKey", label: "API Key", type: "password", placeholder: "ZR Express API Key" },
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
        { key: "apiId", label: "API ID", type: "text", placeholder: "Yalidine API ID" },
        { key: "apiToken", label: "API Token", type: "password", placeholder: "Yalidine API Token" },
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
      iconColor: "text-emerald-600 dark:text-teal-400",
      connected: false,
      connectLabel: t("integrations.connect"),
      fields: [
        { key: "apiToken", label: "API Token", type: "password", placeholder: "Maystro API Token" },
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
      iconColor: "text-emerald-600 dark:text-emerald-400",
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

  const handleSave = async () => {
    if (!connecting) return;
    setSaving(true);
    try {
      const integration = integrationList.find((i) => i.id === connecting);
      if (!integration?.saveEndpoint) return;

      // The delivery credentials API expects { provider, credentials: {...} }
      // The e-commerce connect API expects { provider, ...fields flat }
      const isDelivery = integration.saveEndpoint === "/api/delivery/credentials";
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

      toast.success(t("integrations.connectedSuccess", { name: integration.name }));
      setDialogOpen(false);
      setConnecting(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("integrations.connectFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("settings.tab.integrations")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("integrations.subtitle")}</p>
      </div>

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
                return (
                  <Card key={integration.id} className="shadow-xs hover:shadow-md transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${integration.iconBg}`}>
                          <Icon className={`h-5 w-5 ${integration.iconColor}`} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{integration.name}</p>
                            {integration.connected && (
                              <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs px-1.5">
                                <CheckCircle2 className="me-1 h-3 w-3" />
                                {t("integrations.connected")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {integration.description}
                          </p>
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              size="sm"
                              variant={integration.connected ? "outline" : "default"}
                              onClick={() => handleConnect(integration)}
                              disabled={integration.connected}
                            >
                              {!integration.connected && <Plug className="me-1.5 h-3.5 w-3.5" />}
                              {integration.connected ? t("integrations.connected") : integration.connectLabel}
                            </Button>
                            {integration.docsUrl && (
                              <Button size="sm" variant="ghost" asChild>
                                <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer">
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
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setConnecting(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("integrations.connectTitle", { name: integrationList.find((i) => i.id === connecting)?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>
              {t("integrations.connectDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {connecting && integrationList.find((i) => i.id === connecting)?.fields?.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type={field.type}
                  value={formData[field.key] ?? ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setConnecting(null); }}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Plug className="me-2 h-4 w-4" />}
              {t("integrations.connect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
