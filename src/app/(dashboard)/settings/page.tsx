import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  MessageSquare,
  Truck,
  ShoppingCart,
  Globe,
  Shield,
} from "lucide-react";
import { LicensePanel } from "@/components/settings/license-panel";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Paramètres — SahelFlow" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { t } = await getI18n();

  // Fetch integration statuses
  const integrations = await db.integration.findMany({
    orderBy: { platform: "asc" },
  });

  const integrationCategories = [
    {
      title: t("settings.categoryAI"),
      icon: Bot,
      accentBg: "bg-violet-500/10 dark:bg-violet-500/15",
      accentIcon: "text-violet-600 dark:text-violet-400",
      items: [
        { platform: "gemini", name: "Gemini 3.5 Flash", type: "AI", description: t("settings.geminiDesc") },
      ],
    },
    {
      title: t("settings.categoryMessaging"),
      icon: MessageSquare,
      accentBg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      accentIcon: "text-emerald-600 dark:text-emerald-400",
      items: [
        { platform: "whatsapp", name: "WhatsApp (Baileys)", type: "Social", description: t("settings.whatsappDesc") },
      ],
    },
    {
      title: t("settings.categoryDelivery"),
      icon: Truck,
      accentBg: "bg-sky-500/10 dark:bg-sky-500/15",
      accentIcon: "text-sky-600 dark:text-sky-400",
      items: [
        { platform: "yalidine", name: "Yalidine", type: "Delivery", description: t("settings.deliveryDesc") },
        { platform: "maystro", name: "Maystro Delivery", type: "Delivery", description: t("settings.deliveryDesc") },
        { platform: "zrexpress", name: "ZR Express", type: "Delivery", description: t("settings.deliveryDesc") },
      ],
    },
    {
      title: t("settings.categoryEcommerce"),
      icon: ShoppingCart,
      accentBg: "bg-amber-500/10 dark:bg-amber-500/15",
      accentIcon: "text-amber-600 dark:text-amber-400",
      items: [
        { platform: "shopify", name: "Shopify", type: "E-commerce", description: t("settings.ecommerceDesc") },
        { platform: "woocommerce", name: "WooCommerce", type: "E-commerce", description: t("settings.ecommerceDesc") },
        { platform: "youcan", name: "YouCan", type: "E-commerce", description: t("settings.ecommerceDesc") },
      ],
    },
  ];

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.settings")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("settings.subtitle")}
        </p>
      </div>

      {/* License panel */}
      <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
        <LicensePanel />
      </div>

      {/* AI key wizard */}
      <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <AiKeyPanel />
      </div>

      {/* Delivery credentials */}
      <div className="animate-fade-up" style={{ animationDelay: "180ms" }}>
        <DeliveryCredentialsPanel />
      </div>

      {/* Integrations — upgraded with accent icons per category */}
      <Card className="card-hover animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-3.5 w-3.5 text-primary" />
            </div>
            {t("settings.integrations")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {integrationCategories.map((category) => {
            const CategoryIcon = category.icon;
            return (
              <div key={category.title} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <div className={`flex size-6 items-center justify-center rounded-md ${category.accentBg}`}>
                    <CategoryIcon className={`h-3 w-3 ${category.accentIcon}`} />
                  </div>
                  {category.title}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {category.items.map((item) => {
                    const integration = integrations.find((i) => i.platform === item.platform);
                    const isActive = integration?.isActive ?? false;
                    return (
                      <div
                        key={item.platform}
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            {t("settings.connected")}
                          </span>
                        ) : (
                          <Badge variant="outline">{t("settings.notConnected")}</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
                <Separator />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Daily WhatsApp report panel */}
      <div className="animate-fade-up" style={{ animationDelay: "300ms" }}>
        <DailyReportPanel />
      </div>

      {/* About */}
      <Card className="card-hover animate-fade-up" style={{ animationDelay: "360ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <div className="flex size-7 items-center justify-center rounded-lg bg-muted">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            {t("settings.about")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("settings.version")}</span>
            <span className="font-mono">3.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("settings.architecture")}</span>
            <span className="font-medium">Local-first (Tauri)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("settings.database")}</span>
            <span className="font-medium">SQLite</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("settings.monthlyCost")}</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">0 DA</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
