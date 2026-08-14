"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  DatabaseBackup,
  Palette,
  PlugZap,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { SahelFlowMark } from "@/components/brand/sahelflow-mark";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { CollaborationAdminPanel } from "@/components/settings/collaboration-admin-panel";
import { CommerceIntegrationsPanel } from "@/components/settings/commerce-integrations-panel";
import { CommerceSyncRecoveryPanel } from "@/components/settings/commerce-sync-recovery-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";
import { DangerZonePanel } from "@/components/settings/danger-zone-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DemoDataPanel } from "@/components/settings/demo-data-panel";
import { LicensePanel } from "@/components/settings/license-panel";
import { PhoneReputationPanel } from "@/components/settings/phone-reputation-panel";
import { SecurityAuthorityPanel } from "@/components/settings/security-authority-panel";
import { TeamAccessAuthorityPanel } from "@/components/settings/team-access-authority-panel";
import { TeamMembersPanel } from "@/components/settings/team-members-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceCopyKey,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { cn } from "@/lib/utils";

export type SettingsWorkspaceAccess = {
  profile: boolean;
  security: boolean;
  team: boolean;
  appearance: boolean;
  license: boolean;
  demo: boolean;
  aiKey: boolean;
  aiConsent: boolean;
  delivery: boolean;
  reports: boolean;
  commerceRead: boolean;
  commerceManage: boolean;
  commerceSync: boolean;
  phone: boolean;
  phoneManage: boolean;
  backupRead: boolean;
  backupCreate: boolean;
  backupRestore: boolean;
  dataExport: boolean;
  dangerReset: boolean;
};

type Group = "experience" | "connections" | "team" | "data";
type GroupDefinition = {
  id: Group;
  icon: typeof Palette;
  descriptionKey: SettingsWorkspaceCopyKey;
};

const DEFAULT_GROUP: GroupDefinition = {
  id: "experience",
  icon: Palette,
  descriptionKey: "experienceDescription",
};

const GROUPS: GroupDefinition[] = [
  DEFAULT_GROUP,
  {
    id: "connections",
    icon: PlugZap,
    descriptionKey: "connectionsDescription",
  },
  { id: "team", icon: ShieldCheck, descriptionKey: "teamDescription" },
  { id: "data", icon: DatabaseBackup, descriptionKey: "dataDescription" },
];

function groupVisible(group: Group, access: SettingsWorkspaceAccess): boolean {
  switch (group) {
    case "experience":
      return access.profile || access.appearance || access.reports || access.phone;
    case "connections":
      return (
        access.commerceRead ||
        access.commerceManage ||
        access.delivery ||
        access.aiKey ||
        access.aiConsent
      );
    case "team":
      return access.security || access.team || access.license;
    case "data":
      return (
        access.backupRead ||
        access.backupCreate ||
        access.backupRestore ||
        access.demo ||
        access.dataExport ||
        access.dangerReset
      );
  }
}

export function SettingsWorkspace({
  integrations,
  access,
}: {
  integrations: Array<{ platform: string; status: string }>;
  access: SettingsWorkspaceAccess;
}) {
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = (key: SettingsWorkspaceCopyKey) =>
    getSettingsWorkspaceCopy(locale, key);
  const visibleGroups = useMemo(
    () => GROUPS.filter((group) => groupVisible(group.id, access)),
    [access],
  );
  const [active, setActive] = useState<Group>(visibleGroups[0]?.id ?? "experience");
  const effectiveGroup =
    visibleGroups.find((group) => group.id === active) ??
    visibleGroups[0] ??
    DEFAULT_GROUP;
  const effectiveActive = effectiveGroup.id;

  const renderExperience = () => (
    <div className="space-y-6">
      {access.profile ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/30 text-muted-foreground">
                <UserRound className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold">{copy("profile")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {copy("profileDescription")}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/profile">{copy("openProfile")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {access.appearance ? (
        <div id="settings-tab-appearance">
          <AppearancePanel />
        </div>
      ) : null}
      {access.reports ? <DailyReportPanel /> : null}
      {access.phone ? (
        <PhoneReputationPanel canManage={access.phoneManage} />
      ) : null}
    </div>
  );

  const renderConnections = () => (
    <div className="space-y-6">
      {access.commerceRead || access.commerceManage ? (
        <CommerceIntegrationsPanel
          integrations={integrations}
          canManage={access.commerceManage}
          canSync={access.commerceSync}
        />
      ) : null}
      {access.commerceManage ? <CommerceSyncRecoveryPanel /> : null}
      {access.delivery ? <DeliveryCredentialsPanel /> : null}
      {access.aiKey || access.aiConsent ? (
        <AiKeyPanel
          canManageKey={access.aiKey}
          canManageConsent={access.aiConsent}
        />
      ) : null}
    </div>
  );

  const renderTeam = () => (
    <div className="space-y-6">
      {access.security ? <SecurityAuthorityPanel /> : null}
      {access.team ? (
        <>
          <TeamAccessAuthorityPanel />
          <TeamMembersPanel />
          <CollaborationAdminPanel />
        </>
      ) : null}
      {access.license ? <LicensePanel /> : null}
    </div>
  );

  const renderData = () => (
    <div className="space-y-6">
      {access.backupRead || access.backupCreate || access.backupRestore ? (
        <BackupRestorePanel
          canRead={access.backupRead}
          canCreate={access.backupCreate}
          canRestore={access.backupRestore}
        />
      ) : null}
      {access.demo ? <DemoDataPanel /> : null}
      {access.dataExport || access.dangerReset ? (
        <DangerZonePanel
          canExport={access.dataExport}
          canReset={access.dangerReset}
        />
      ) : null}
    </div>
  );

  const content =
    effectiveActive === "experience"
      ? renderExperience()
      : effectiveActive === "connections"
        ? renderConnections()
        : effectiveActive === "team"
          ? renderTeam()
          : renderData();

  const EffectiveIcon = effectiveGroup.icon;

  return (
    <div
      data-settings-workspace="v2"
      data-settings-premium-shell="true"
      className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm"
    >
      <div className="grid min-h-[34rem] lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-border/80 bg-muted/15 p-3 lg:border-b-0 lg:border-e lg:p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-border/70 bg-background/75 p-3 shadow-xs">
            <SahelFlowMark className="size-9 shrink-0 rounded-lg shadow-sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <BriefcaseBusiness
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="truncate">SahelFlow</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {copy("workspaceHint")}
              </p>
            </div>
          </div>

          <nav
            aria-label={copy("workspaceHint")}
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-1"
          >
            {visibleGroups.map((group) => {
              const Icon = group.icon;
              const selected = effectiveActive === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  data-settings-group={group.id}
                  aria-pressed={selected}
                  onClick={() => setActive(group.id)}
                  className={cn(
                    "group rounded-xl border px-3 py-3 text-start outline-none",
                    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    selected
                      ? "border-primary/25 bg-primary/[0.08] text-foreground shadow-sm"
                      : "border-transparent text-muted-foreground hover:-translate-y-px hover:border-border/80 hover:bg-background/80 hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2.5 text-xs font-semibold">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background/80",
                        selected
                          ? "border-primary/25 text-primary"
                          : "border-border/70 text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 truncate">{copy(group.id)}</span>
                  </span>
                  <span className="mt-1.5 hidden ps-10 text-[11px] leading-4 text-muted-foreground lg:block">
                    {copy(group.descriptionKey)}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section
          data-settings-group-panel={effectiveActive}
          aria-labelledby={`settings-workspace-${effectiveActive}`}
          className="min-w-0 bg-background/45"
        >
          <header className="border-b border-border/80 bg-card/85 px-4 py-4 backdrop-blur-sm sm:px-5 lg:px-6">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.08] text-primary shadow-xs">
                <EffectiveIcon className="size-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2
                  id={`settings-workspace-${effectiveActive}`}
                  className="truncate text-base font-semibold tracking-tight"
                >
                  {copy(effectiveActive)}
                </h2>
                <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm">
                  {copy(effectiveGroup.descriptionKey)}
                </p>
              </div>
            </div>
          </header>

          <div className="p-3 sm:p-5 lg:p-6">{content}</div>
        </section>
      </div>
    </div>
  );
}
