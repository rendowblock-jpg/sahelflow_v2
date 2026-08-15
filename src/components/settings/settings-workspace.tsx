"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  Bot,
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

type Group =
  | "workspace"
  | "operations"
  | "connections"
  | "intelligence"
  | "access"
  | "data";

type GroupDefinition = {
  id: Group;
  icon: typeof Palette;
  descriptionKey: SettingsWorkspaceCopyKey;
};

const DEFAULT_GROUP: GroupDefinition = {
  id: "workspace",
  icon: Palette,
  descriptionKey: "workspaceDescription",
};

const GROUPS: GroupDefinition[] = [
  DEFAULT_GROUP,
  {
    id: "operations",
    icon: Activity,
    descriptionKey: "operationsDescription",
  },
  {
    id: "connections",
    icon: PlugZap,
    descriptionKey: "connectionsDescription",
  },
  {
    id: "intelligence",
    icon: Bot,
    descriptionKey: "intelligenceDescription",
  },
  {
    id: "access",
    icon: ShieldCheck,
    descriptionKey: "accessDescription",
  },
  {
    id: "data",
    icon: DatabaseBackup,
    descriptionKey: "dataDescription",
  },
];

function groupVisible(group: Group, access: SettingsWorkspaceAccess): boolean {
  switch (group) {
    case "workspace":
      return access.profile || access.appearance;
    case "operations":
      return access.reports || access.phone;
    case "connections":
      return access.commerceRead || access.commerceManage || access.delivery;
    case "intelligence":
      return access.aiKey || access.aiConsent;
    case "access":
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
  const [active, setActive] = useState<Group>(
    visibleGroups[0]?.id ?? "workspace",
  );
  const effectiveGroup =
    visibleGroups.find((group) => group.id === active) ??
    visibleGroups[0] ??
    DEFAULT_GROUP;
  const effectiveActive = effectiveGroup.id;

  const renderWorkspace = () => (
    <div className="space-y-5">
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
    </div>
  );

  const renderOperations = () => (
    <div className="space-y-5">
      {access.reports ? <DailyReportPanel /> : null}
      {access.phone ? (
        <PhoneReputationPanel canManage={access.phoneManage} />
      ) : null}
    </div>
  );

  const renderConnections = () => (
    <div className="space-y-5">
      {access.commerceRead || access.commerceManage ? (
        <CommerceIntegrationsPanel
          integrations={integrations}
          canManage={access.commerceManage}
          canSync={access.commerceSync}
        />
      ) : null}
      {access.commerceManage ? <CommerceSyncRecoveryPanel /> : null}
      {access.delivery ? <DeliveryCredentialsPanel /> : null}
    </div>
  );

  const renderIntelligence = () => (
    <div className="space-y-5">
      {access.aiKey || access.aiConsent ? (
        <AiKeyPanel
          canManageKey={access.aiKey}
          canManageConsent={access.aiConsent}
        />
      ) : null}
    </div>
  );

  const renderAccess = () => (
    <div className="space-y-5">
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
    <div className="space-y-5">
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
    effectiveActive === "workspace"
      ? renderWorkspace()
      : effectiveActive === "operations"
        ? renderOperations()
        : effectiveActive === "connections"
          ? renderConnections()
          : effectiveActive === "intelligence"
            ? renderIntelligence()
            : effectiveActive === "access"
              ? renderAccess()
              : renderData();

  const EffectiveIcon = effectiveGroup.icon;

  return (
    <div
      data-settings-workspace="v2"
      data-settings-premium-shell="true"
      className="overflow-hidden rounded-xl border border-border/80 bg-card"
    >
      <div className="grid min-h-[36rem] lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-border/80 bg-muted/10 p-3 lg:border-b-0 lg:border-e lg:p-3.5">
          <div className="px-2 pb-3 pt-1">
            <p className="text-sm font-semibold text-foreground">
              {copy("workspaceHint")}
            </p>
          </div>

          <nav
            aria-label={copy("workspaceHint")}
            className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1"
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
                    "group relative rounded-lg px-2.5 py-2.5 text-start outline-none",
                    "transition-[background-color,color,box-shadow] duration-150",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    selected
                      ? "bg-primary/[0.09] text-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-background/75 hover:text-foreground",
                  )}
                >
                  {selected ? (
                    <span
                      className="absolute inset-block-2 start-0 w-0.5 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background/85",
                        selected
                          ? "border-primary/25 text-primary"
                          : "border-border/70 text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">
                        {copy(group.id)}
                      </span>
                      <span className="mt-0.5 hidden text-[11px] leading-4 text-muted-foreground lg:block">
                        {copy(group.descriptionKey)}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <section
          data-settings-group-panel={effectiveActive}
          aria-labelledby={`settings-workspace-${effectiveActive}`}
          className="min-w-0 bg-background/35"
        >
          <header className="border-b border-border/75 bg-card/88 px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/[0.07] text-primary">
                <EffectiveIcon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2
                  id={`settings-workspace-${effectiveActive}`}
                  className="text-lg font-semibold tracking-tight"
                >
                  {copy(effectiveActive)}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
                  {copy(effectiveGroup.descriptionKey)}
                </p>
              </div>
            </div>
          </header>

          <div className="mx-auto w-full max-w-5xl p-3 sm:p-5 lg:p-6">
            {content}
          </div>
        </section>
      </div>
    </div>
  );
}
