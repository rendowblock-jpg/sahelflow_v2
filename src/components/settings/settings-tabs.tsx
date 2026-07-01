"use client";

import { useState, useRef } from "react";
import { Shield, Bot, Truck, Bell, Store, DatabaseBackup } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { LicensePanel } from "@/components/settings/license-panel";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";

type Tab = "ai" | "delivery" | "reports" | "integrations" | "license" | "backup";

const TABS: Array<{ id: Tab; icon: typeof Shield }> = [
  { id: "license", icon: Shield },
  { id: "ai", icon: Bot },
  { id: "delivery", icon: Truck },
  { id: "reports", icon: Bell },
  { id: "integrations", icon: Store },
  { id: "backup", icon: DatabaseBackup },
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
      {/* Tab sidebar — premium tinted active state */}
      <nav className="flex lg:w-56 lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              role="tab"
              aria-selected={active === tab.id}
              tabIndex={active === tab.id ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const tabs = tabListRef.current;
                  if (!tabs) return;
                  const buttons = Array.from(tabs.querySelectorAll('[role="tab"]'));
                  const idx = buttons.indexOf(e.currentTarget);
                  const next = e.key === "ArrowRight" ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
                  (buttons[next] as HTMLButtonElement)?.focus();
                  (buttons[next] as HTMLButtonElement)?.click();
                }
              }}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap",
                isActive
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
              )}
            >
              <Icon className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )} />
              {t(`settings.tab.${tab.id}`)}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div role="tabpanel" className="flex-1 min-w-0" id="settings-panel" aria-labelledby="settings-tablist">
        {active === "license" && <LicensePanel />}
        {active === "ai" && <AiKeyPanel />}
        {active === "delivery" && <DeliveryCredentialsPanel />}
        {active === "reports" && <DailyReportPanel />}
        {active === "integrations" && (
          <IntegrationsPanel integrations={integrations} />
        )}
        {active === "backup" && <BackupRestorePanel />}
      </div>
    </div>
  );
}
