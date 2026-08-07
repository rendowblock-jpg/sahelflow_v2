"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Bot,
  Database,
  DatabaseBackup,
  Palette,
  Phone,
  Shield,
  ShieldCheck,
  Store,
  Truck,
  UserCircle,
  Users,
} from "lucide-react";

import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { CollaborationAdminPanel } from "@/components/settings/collaboration-admin-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";
import { DangerZonePanel } from "@/components/settings/danger-zone-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DemoDataPanel } from "@/components/settings/demo-data-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { LicensePanel } from "@/components/settings/license-panel";
import { PhoneReputationPanel } from "@/components/settings/phone-reputation-panel";
import { SecurityAuthorityPanel } from "@/components/settings/security-authority-panel";
import { TeamAccessAuthorityPanel } from "@/components/settings/team-access-authority-panel";
import { TeamMembersPanel } from "@/components/settings/team-members-panel";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { isRTL } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tab =
  | "profile"
  | "security"
  | "team"
  | "appearance"
  | "license"
  | "demo"
  | "ai"
  | "delivery"
  | "reports"
  | "integrations"
  | "phone"
  | "backup"
  | "danger";

export type SettingsTabAccess = Record<Tab, boolean>;

const TABS: Array<{ id: Tab; icon: typeof Shield; labelKey: string }> = [
  { id: "profile", icon: UserCircle, labelKey: "settings.tabs.profile" },
  { id: "security", icon: ShieldCheck, labelKey: "settings.tabs.security" },
  { id: "team", icon: Users, labelKey: "settings.tabs.team" },
  { id: "appearance", icon: Palette, labelKey: "settings.tabs.appearance" },
  { id: "license", icon: Shield, labelKey: "settings.tabs.license" },
  { id: "demo", icon: Database, labelKey: "settings.tabs.demo" },
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
  access,
}: {
  integrations: Array<{ platform: string; status: string }>;
  access: SettingsTabAccess;
}) {
  const { t, locale } = useI18n();
  const rtl = isRTL(locale);
  const visibleTabs = useMemo(
    () => TABS.filter((tab) => access[tab.id]),
    [access],
  );
  const [active, setActive] = useState<Tab>(visibleTabs[0]?.id ?? "profile");
  const effectiveActive = access[active] ? active : (visibleTabs[0]?.id ?? "profile");

  const renderPanel = () => {
    switch (effectiveActive) {
      case "security":
        return <SecurityAuthorityPanel />;
      case "team":
        return (
          <div className="space-y-8">
            <TeamAccessAuthorityPanel />
            <TeamMembersPanel />
            <CollaborationAdminPanel />
          </div>
        );
      case "license":
        return <LicensePanel />;
      case "demo":
        return <DemoDataPanel />;
      case "ai":
        return <AiKeyPanel />;
      case "delivery":
        return <DeliveryCredentialsPanel />;
      case "reports":
        return <DailyReportPanel />;
      case "integrations":
        return <IntegrationsPanel integrations={integrations} />;
      case "backup":
        return <BackupRestorePanel />;
      case "appearance":
        return <AppearancePanel />;
      case "phone":
        return <PhoneReputationPanel />;
      case "danger":
        return <DangerZonePanel />;
      default:
        return (
          <div className="rounded-md border p-6">
            <h3 className="text-base font-semibold">{t("settings.tabs.profile")}</h3>
            <div className="mt-4">
              <Button asChild variant="outline">
                <Link href="/profile">{t("settings.tabs.profile")}</Link>
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav
        role="tablist"
        className="flex gap-1 overflow-x-auto pb-2 lg:w-56 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {visibleTabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = effectiveActive === tab.id;
          return (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              type="button"
              onClick={() => setActive(tab.id)}
              role="tab"
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(event) => {
                if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                let nextIndex = index;
                if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = visibleTabs.length - 1;
                else {
                  const horizontalDirection = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  const verticalDirection = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                  const direction = horizontalDirection !== 0
                    ? (rtl ? -horizontalDirection : horizontalDirection)
                    : verticalDirection;
                  nextIndex = (index + direction + visibleTabs.length) % visibleTabs.length;
                }
                const next = visibleTabs[nextIndex];
                if (next) {
                  setActive(next.id);
                  requestAnimationFrame(() =>
                    document.getElementById(`settings-tab-${next.id}`)?.focus(),
                  );
                }
              }}
              className={cn(
                "relative flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                tab.id === "danger" && !isActive && "text-destructive/80 hover:text-destructive",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <section
        id={`settings-panel-${effectiveActive}`}
        role="tabpanel"
        aria-labelledby={`settings-tab-${effectiveActive}`}
        tabIndex={0}
        className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {renderPanel()}
      </section>
    </div>
  );
}
