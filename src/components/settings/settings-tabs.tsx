"use client";

import { useState } from "react";
import { Shield, Bot, Truck, Bell, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { LicensePanel } from "@/components/settings/license-panel";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";

type Tab = "general" | "ai" | "delivery" | "reports" | "integrations" | "license";

const TABS: Array<{ id: Tab; icon: typeof Shield }> = [
  { id: "license", icon: Shield },
  { id: "ai", icon: Bot },
  { id: "delivery", icon: Truck },
  { id: "reports", icon: Bell },
  { id: "integrations", icon: Store },
];

export function SettingsTabs({
  integrations,
}: {
  integrations: Array<{ platform: string; status: string }>;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<Tab>("license");

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Tab sidebar */}
      <nav className="flex lg:w-56 lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(`settings.tab.${tab.id}`)}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div className="flex-1 min-w-0">
        {active === "license" && <LicensePanel />}
        {active === "ai" && <AiKeyPanel />}
        {active === "delivery" && <DeliveryCredentialsPanel />}
        {active === "reports" && <DailyReportPanel />}
        {active === "integrations" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t("settings.tab.integrations")}</h2>
            <div className="grid gap-3">
              {integrations.map((int) => (
                <div
                  key={int.platform}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium capitalize">{int.platform}</p>
                    <p className="text-xs text-muted-foreground">{int.status}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      int.status === "active"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {int.status === "active" ? t("common.active") : t("common.inactive")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
