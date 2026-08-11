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
  ai: boolean;
  delivery: boolean;
  reports: boolean;
  integrations: boolean;
  phone: boolean;
  phoneManage: boolean;
  backup: boolean;
  danger: boolean;
};

type Group = "experience" | "connections" | "team" | "data";

const GROUPS: Array<{
  id: Group;
  icon: typeof Palette;
  descriptionKey: SettingsWorkspaceCopyKey;
}> = [
  {
    id: "experience",
    icon: Palette,
    descriptionKey: "experienceDescription",
  },
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
      return access.integrations || access.delivery || access.ai;
    case "team":
      return access.security || access.team || access.license;
    case "data":
      return access.backup || access.demo || access.danger;
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
    GROUPS[0];
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
      {access.appearance ? <AppearancePanel /> : null}
      {access.reports ? <DailyReportPanel /> : null}
      {access.phone ? (
        <PhoneReputationPanel canManage={access.phoneManage} />
      ) : null}
    </div>
  );

  const renderConnections = () => (
    <div className="space-y-6">
      {access.integrations ? (
        <>
          <CommerceIntegrationsPanel integrations={integrations} />
          <CommerceSyncRecoveryPanel />
        </>
      ) : null}
      {access.delivery ? <DeliveryCredentialsPanel /> : null}
      {access.ai ? <AiKeyPanel /> : null}
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
      {access.backup ? <BackupRestorePanel /> : null}
      {access.demo ? <DemoDataPanel /> : null}
      {access.danger ? <DangerZonePanel /> : null}
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
      className="grid min-h-[32rem] gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]"
    >
      <aside className="min-w-0">
        <div className="rounded-xl border bg-card p-2 lg:sticky lg:top-4">
          <div className="mb-2 px-2.5 py-2">
            <div className="flex items-start gap-2 text-xs font-semibold">
              <BriefcaseBusiness
                className="mt-0.5 size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span className="leading-5">{copy("workspaceHint")}</span>
            </div>
          </div>
          <nav
            aria-label={copy("workspaceHint")}
            className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1"
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
                    "rounded-lg px-3 py-3 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-primary/8 text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs font-semibold">
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {copy(group.id)}
                  </span>
                  <span className="mt-1 hidden text-[10px] leading-4 text-muted-foreground lg:block">
                    {copy(group.descriptionKey)}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <section
        data-settings-group-panel={effectiveActive}
        aria-labelledby={`settings-workspace-${effectiveActive}`}
        className="min-w-0"
      >
        <header className="mb-4 rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
              <EffectiveIcon className="size-[18px]" aria-hidden="true" />
            </span>
            <div>
              <h2
                id={`settings-workspace-${effectiveActive}`}
                className="text-sm font-semibold"
              >
                {copy(effectiveActive)}
              </h2>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {copy(effectiveGroup.descriptionKey)}
              </p>
            </div>
          </div>
        </header>
        {content}
      </section>
    </div>
  );
}
