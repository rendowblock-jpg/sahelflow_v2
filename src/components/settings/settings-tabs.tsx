"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { AlertTriangle, Bell, Bot, Database, DatabaseBackup, Palette, Phone, Shield, ShieldCheck, Store, Truck, UserCircle, Users } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { isRTL } from "@/lib/i18n";

type Tab = "profile" | "security" | "team" | "appearance" | "license" | "demo" | "ai" | "delivery" | "reports" | "integrations" | "phone" | "backup" | "danger";
export interface SettingsSurfaceAccess { settingsManage: boolean; sessionsRead: boolean; membersRead: boolean; licenseRead: boolean; licenseManage: boolean; integrationsRead: boolean; integrationsManage: boolean; deliveryCredentialsManage: boolean; backups: boolean; riskRead: boolean; }
const TABS: Array<{ id: Tab; icon: typeof Shield; labelKey: string; allowed: (access: SettingsSurfaceAccess) => boolean }> = [
  { id: "profile", icon: UserCircle, labelKey: "settings.tabs.profile", allowed: () => true },
  { id: "security", icon: ShieldCheck, labelKey: "settings.tabs.security", allowed: (a) => a.sessionsRead },
  { id: "team", icon: Users, labelKey: "settings.tabs.team", allowed: (a) => a.membersRead },
  { id: "appearance", icon: Palette, labelKey: "settings.tabs.appearance", allowed: () => true },
  { id: "license", icon: Shield, labelKey: "settings.tabs.license", allowed: (a) => a.licenseRead || a.licenseManage },
  { id: "demo", icon: Database, labelKey: "settings.tabs.demo", allowed: (a) => a.settingsManage },
  { id: "ai", icon: Bot, labelKey: "settings.tabs.ai", allowed: (a) => a.integrationsManage },
  { id: "delivery", icon: Truck, labelKey: "settings.tabs.delivery", allowed: (a) => a.deliveryCredentialsManage },
  { id: "reports", icon: Bell, labelKey: "settings.tabs.reports", allowed: (a) => a.settingsManage },
  { id: "integrations", icon: Store, labelKey: "settings.tabs.integrations", allowed: (a) => a.integrationsRead },
  { id: "phone", icon: Phone, labelKey: "settings.tabs.phoneReputation", allowed: (a) => a.riskRead },
  { id: "backup", icon: DatabaseBackup, labelKey: "settings.tabs.backup", allowed: (a) => a.backups },
  { id: "danger", icon: AlertTriangle, labelKey: "settings.tabs.dangerZone", allowed: (a) => a.settingsManage },
];

export function SettingsTabs({ access, integrations }: { access: SettingsSurfaceAccess; integrations: Array<{ platform: string; status: string }> }) {
  const { t, locale } = useI18n();
  const rtl = isRTL(locale);
  const visibleTabs = useMemo(() => TABS.filter((tab) => tab.allowed(access)), [access]);
  const [queryTab, setQueryTab] = useQueryState("tab", { defaultValue: "profile", shallow: true });
  const active = (visibleTabs.some((tab) => tab.id === queryTab) ? queryTab : visibleTabs[0]?.id ?? "profile") as Tab;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { if (queryTab !== active) void setQueryTab(active); }, [active, queryTab, setQueryTab]);
  const select = (index: number) => { const tab = visibleTabs[(index + visibleTabs.length) % visibleTabs.length]; if (!tab) return; void setQueryTab(tab.id); queueMicrotask(() => refs.current[(index + visibleTabs.length) % visibleTabs.length]?.focus()); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => { let next: number | null = null; if (event.key === "Home") next = 0; else if (event.key === "End") next = visibleTabs.length - 1; else if (event.key === "ArrowDown") next = index + 1; else if (event.key === "ArrowUp") next = index - 1; else if (event.key === "ArrowRight") next = index + (rtl ? -1 : 1); else if (event.key === "ArrowLeft") next = index + (rtl ? 1 : -1); if (next !== null) { event.preventDefault(); select(next); } };
  return <div className="flex flex-col gap-6 lg:flex-row"><nav role="tablist" aria-orientation="vertical" className="flex gap-1 overflow-x-auto pb-2 lg:w-60 lg:flex-col lg:overflow-visible lg:pb-0">{visibleTabs.map((tab, index) => { const Icon = tab.icon; const selected = active === tab.id; return <button key={tab.id} ref={(node) => { refs.current[index] = node; }} id={`settings-tab-${tab.id}`} role="tab" aria-selected={selected} aria-controls={`settings-panel-${tab.id}`} tabIndex={selected ? 0 : -1} onClick={() => void setQueryTab(tab.id)} onKeyDown={(event) => onKeyDown(event, index)} className={cn("flex min-h-9 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", selected ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground", tab.id === "danger" && "text-destructive")}><Icon className="size-4 shrink-0" aria-hidden="true" /><span>{t(tab.labelKey)}</span></button>; })}</nav><section id={`settings-panel-${active}`} role="tabpanel" aria-labelledby={`settings-tab-${active}`} tabIndex={0} className="min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">{active === "security" ? <SecurityAuthorityPanel /> : null}{active === "team" ? <div className="space-y-8"><TeamAccessAuthorityPanel /><TeamMembersPanel />{access.settingsManage ? <CollaborationAdminPanel /> : null}</div> : null}{active === "license" ? <LicensePanel /> : null}{active === "demo" ? <DemoDataPanel /> : null}{active === "ai" ? <AiKeyPanel /> : null}{active === "delivery" ? <DeliveryCredentialsPanel /> : null}{active === "reports" ? <DailyReportPanel /> : null}{active === "integrations" ? <IntegrationsPanel integrations={integrations} /> : null}{active === "backup" ? <BackupRestorePanel /> : null}{active === "appearance" ? <AppearancePanel /> : null}{active === "phone" ? <PhoneReputationPanel /> : null}{active === "danger" ? <DangerZonePanel /> : null}{active === "profile" ? <div className="rounded-md border p-6"><h3 className="text-base font-semibold">{t("settings.tabs.profile")}</h3><p className="mt-1 text-sm text-muted-foreground"><Link href="/profile" className="text-primary underline underline-offset-4">{t("profile.title")}</Link></p></div> : null}</section></div>;
}
