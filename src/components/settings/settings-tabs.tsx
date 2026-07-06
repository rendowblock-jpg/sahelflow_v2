"use client";

import { useState, useRef } from "react";
import {
  Shield, Bot, Truck, Bell, Store, DatabaseBackup,
  UserCircle, Palette, AlertTriangle, Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { LicensePanel } from "@/components/settings/license-panel";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { DangerZonePanel } from "@/components/settings/danger-zone-panel";
import { PhoneReputationPanel } from "@/components/settings/phone-reputation-panel";

type Tab = "profile" | "appearance" | "license" | "ai" | "delivery" | "reports" | "integrations" | "phone" | "backup" | "danger";

const TABS: Array<{ id: Tab; icon: typeof Shield; labelKey: string }> = [
  { id: "profile", icon: UserCircle, labelKey: "settings.tabs.profile" },
  { id: "appearance", icon: Palette, labelKey: "settings.tabs.appearance" },
  { id: "license", icon: Shield, labelKey: "settings.tabs.license" },
  { id: "ai", icon: Bot, labelKey: "settings.tabs.ai" },
  { id: "delivery", icon: Truck, labelKey: "settings.tabs.delivery" },
  { id: "reports", icon: Bell, labelKey: "settings.tabs.reports" },
  { id: "integrations", icon: Store, labelKey: "settings.tabs.integrations" },
  { id: "phone", icon: Phone, labelKey: "settings.tabs.phoneReputation" },
  { id: "backup", icon: DatabaseBackup, labelKey: "settings.tabs.backup" },
  { id: "danger", icon: AlertTriangle, labelKey: "settings.tabs.dangerZone" },
];

export function SettingsTabs({
  integrations,
}: {
  integrations: Array<{ platform: string; status: string }>;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<Tab>("license");
  const tabListRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={tabListRef} role="tablist" className="flex flex-col gap-6 lg:flex-row">
      {/* Tab sidebar — left-rail tree with search */}
      <nav className="flex lg:w-56 lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const idx = TABS.findIndex((x) => x.id === active);
                  const dir = e.key === "ArrowRight" ? 1 : -1;
                  const next = TABS[(idx + dir + TABS.length) % TABS.length];
                  if (next) setActive(next.id);
                }
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap relative",
                isActive
                  ? "bg-primary/5 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                tab.id === "danger" && !isActive && "text-destructive/70 hover:text-destructive",
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute start-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              <span>{t(tab.labelKey) || tab.id}</span>
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
        {active === "integrations" && <IntegrationsPanel integrations={integrations} />}
        {active === "backup" && <BackupRestorePanel />}
        {active === "appearance" && <AppearancePanel />}
        {active === "phone" && <PhoneReputationPanel />}
        {active === "danger" && <DangerZonePanel />}
        {active === "profile" && (
          <div className="rounded-lg border p-6">
            <h3 className="text-base font-semibold">{t("settings.tabs.profile")}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Profile settings are managed via the <a href="/profile" className="text-primary underline">Profile page</a>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
