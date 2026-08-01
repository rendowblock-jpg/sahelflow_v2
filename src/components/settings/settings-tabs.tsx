"use client";

import { useState, useRef } from "react";
import {
  Shield,
  ShieldCheck,
  Users,
  Bot,
  Truck,
  Bell,
  Store,
  Database,
  DatabaseBackup,
  UserCircle,
  Palette,
  AlertTriangle,
  Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { isRTL } from "@/lib/i18n";
import { LicensePanel } from "@/components/settings/license-panel";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { DangerZonePanel } from "@/components/settings/danger-zone-panel";
import { PhoneReputationPanel } from "@/components/settings/phone-reputation-panel";
import { DemoDataPanel } from "@/components/settings/demo-data-panel";
import { SecurityAuthorityPanel } from "@/components/settings/security-authority-panel";
import { TeamAccessPanel } from "@/components/settings/team-access-panel";
import { TeamMembersPanel } from "@/components/settings/team-members-panel";
import { CollaborationAdminPanel } from "@/components/settings/collaboration-admin-panel";

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

const DEMO_LABELS = {
  ar: "بيانات تجريبية",
  fr: "Données de démo",
  en: "Demo data",
} as const;

const SECURITY_LABELS = {
  ar: "الأمان والجلسات",
  fr: "Sécurité et sessions",
  en: "Security & sessions",
} as const;

const TEAM_LABELS = {
  ar: "وصول الفريق",
  fr: "Accès de l’équipe",
  en: "Team access",
} as const;

export function SettingsTabs({
  integrations,
}: {
  integrations: Array<{ platform: string; status: string }>;
}) {
  const { t, locale } = useI18n();
  const rtl = isRTL(locale);
  const [active, setActive] = useState<Tab>("demo");
  const tabListRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={tabListRef} role="tablist" className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex gap-1 overflow-x-auto pb-2 lg:w-56 lg:flex-col lg:overflow-visible lg:pb-0">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          const label =
            tab.id === "demo"
              ? DEMO_LABELS[locale]
              : tab.id === "security"
                ? SECURITY_LABELS[locale]
                : tab.id === "team"
                  ? TEAM_LABELS[locale]
                  : t(tab.labelKey);
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const index = TABS.findIndex((item) => item.id === active);
                  const rawDirection = event.key === "ArrowRight" ? 1 : -1;
                  const direction = rtl ? -rawDirection : rawDirection;
                  const next =
                    TABS[(index + direction + TABS.length) % TABS.length];
                  if (next) setActive(next.id);
                }
              }}
              className={cn(
                "relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/5 text-primary"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                tab.id === "danger" &&
                  !isActive &&
                  "text-destructive/70 hover:text-destructive",
              )}
            >
              {isActive ? (
                <span className="absolute start-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
              ) : null}
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {active === "security" ? <SecurityAuthorityPanel /> : null}
        {active === "team" ? (
          <div className="space-y-8">
            <TeamAccessPanel />
            <TeamMembersPanel />
            <CollaborationAdminPanel />
          </div>
        ) : null}
        {active === "license" ? <LicensePanel /> : null}
        {active === "demo" ? <DemoDataPanel /> : null}
        {active === "ai" ? <AiKeyPanel /> : null}
        {active === "delivery" ? <DeliveryCredentialsPanel /> : null}
        {active === "reports" ? <DailyReportPanel /> : null}
        {active === "integrations" ? (
          <IntegrationsPanel integrations={integrations} />
        ) : null}
        {active === "backup" ? <BackupRestorePanel /> : null}
        {active === "appearance" ? <AppearancePanel /> : null}
        {active === "phone" ? <PhoneReputationPanel /> : null}
        {active === "danger" ? <DangerZonePanel /> : null}
        {active === "profile" ? (
          <div className="rounded-lg border p-6">
            <h3 className="text-base font-semibold">{t("settings.tabs.profile")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Profile settings are managed via the{" "}
              <a href="/profile" className="text-primary underline">
                Profile page
              </a>
              .
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
