import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LicensePanel } from "@/components/settings/license-panel";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";
import {
  Bot,
  MessageSquare,
  Truck,
  ShoppingCart,
  Globe,
  Shield,

} from "lucide-react";
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
      title: "IA",
      icon: Bot,
      items: [
        { platform: "gemini", name: "Gemini 3.5 Flash", type: "AI", description: "Extraction de commandes + chat IA" },
      ],
    },
    {
      title: "Messagerie",
      icon: MessageSquare,
      items: [
        { platform: "whatsapp", name: "WhatsApp (Baileys)", type: "Social", description: "Réception des commandes WhatsApp" },
        { platform: "tiktok", name: "TikTok DM", type: "Social", description: "Réception des commandes TikTok" },
      ],
    },
    {
      title: "Livraison",
      icon: Truck,
      items: [
        { platform: "yalidine", name: "Yalidine", type: "Delivery", description: "Création + suivi des livraisons" },
        { platform: "maystro", name: "Maystro Delivery", type: "Delivery", description: "Création + suivi des livraisons" },
        { platform: "zrexpress", name: "ZR Express", type: "Delivery", description: "Création + suivi des livraisons" },
      ],
    },
    {
      title: "E-commerce",
      icon: ShoppingCart,
      items: [
        { platform: "shopify", name: "Shopify", type: "E-commerce", description: "Synchronisation des commandes" },
        { platform: "woocommerce", name: "WooCommerce", type: "E-commerce", description: "Synchronisation des commandes" },
        { platform: "youcan", name: "YouCan", type: "E-commerce", description: "Synchronisation des commandes" },
      ],
    },
  ];

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.settings")}</h1>
        <p className="text-sm text-muted-foreground">
          Gérez votre licence, vos intégrations et vos préférences
        </p>
      </div>

      {/* License panel */}
      <LicensePanel />

      {/* AI key wizard */}
      <AiKeyPanel />

      {/* Delivery credentials */}
      <DeliveryCredentialsPanel />

      {/* Integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-5 w-5" />
            Intégrations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {integrationCategories.map((category) => {
            const Icon = category.icon;
            return (
              <div key={category.title} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  {category.title}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {category.items.map((item) => {
                    const integration = integrations.find((i) => i.platform === item.platform);
                    const isActive = integration?.isActive ?? false;
                    return (
                      <div
                        key={item.platform}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.description}</p>
                        </div>
                        <Badge variant={isActive ? "default" : "outline"}>
                          {isActive ? "Connecté" : "Non connecté"}
                        </Badge>
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
      <DailyReportPanel />

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5" />
            À propos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Version</span>
            <span className="font-mono">3.0.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Architecture</span>
            <span className="font-medium">Local-first (Tauri)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base de données</span>
            <span className="font-medium">SQLite local</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Coût mensuel</span>
            <span className="font-medium text-green-600">0 DA</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
