"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  ChevronRight,
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
import { useI18n } from "@/hooks/use-i18n";
import { useMobile } from "@/hooks/use-mobile";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceCopyKey,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { cn } from "@/lib/utils";

import styles from "./settings-control-center.module.css";

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

type SettingsCopy = (key: SettingsWorkspaceCopyKey) => string;

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

function SettingsDirectory({
  groups,
  active,
  copy,
  mobile,
  onSelect,
}: {
  groups: GroupDefinition[];
  active: Group;
  copy: SettingsCopy;
  mobile: boolean;
  onSelect: (group: Group) => void;
}) {
  return (
    <nav
      data-settings-directory="true"
      aria-label={copy("workspaceHint")}
      className={mobile ? "space-y-2" : "space-y-1"}
    >
      {groups.map((group) => {
        const Icon = group.icon;
        const selected = active === group.id;
        return (
          <button
            key={group.id}
            type="button"
            data-settings-group={group.id}
            aria-pressed={selected}
            onClick={() => onSelect(group.id)}
            className={cn(
              "group relative w-full rounded-xl text-start outline-none transition-[background-color,color,box-shadow] duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              mobile ? "px-3.5 py-3.5" : "px-3 py-2.5",
              selected && !mobile
                ? "bg-primary/[0.085] text-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/55 hover:text-foreground",
            )}
          >
            {selected && !mobile ? (
              <span
                className="absolute inset-block-2 start-0 w-0.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            ) : null}
            <span className="flex items-center gap-3">
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-xl border bg-background",
                  mobile ? "size-10" : "size-9",
                  selected && !mobile
                    ? "border-primary/30 text-primary"
                    : "border-border/70 text-muted-foreground group-hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  {copy(group.id)}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {copy(group.descriptionKey)}
                </span>
              </span>
              {mobile ? (
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                  aria-hidden="true"
                />
              ) : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
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
  const mobile = useMobile();
  const copy: SettingsCopy = (key) => getSettingsWorkspaceCopy(locale, key);
  const visibleGroups = useMemo(
    () => GROUPS.filter((group) => groupVisible(group.id, access)),
    [access],
  );
  const [active, setActive] = useState<Group>(
    visibleGroups[0]?.id ?? "workspace",
  );
  const [mobilePane, setMobilePane] = useState<"directory" | "detail">(
    "directory",
  );
  const effectiveGroup =
    visibleGroups.find((group) => group.id === active) ??
    visibleGroups[0] ??
    DEFAULT_GROUP;
  const effectiveActive = effectiveGroup.id;

  const selectGroup = (group: Group) => {
    setActive(group);
    if (mobile) setMobilePane("detail");
  };

  const renderWorkspace = () => (
    <div className={styles.stack} data-settings-domain-stack="workspace">
      {access.profile ? (
        <section className="flex flex-wrap items-center justify-between gap-4 py-7">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/30 text-muted-foreground">
              <UserRound className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">{copy("profile")}</p>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {copy("profileDescription")}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/profile">{copy("openProfile")}</Link>
          </Button>
        </section>
      ) : null}
      {access.appearance ? (
        <div
          id="settings-tab-appearance"
          className={cn(
            styles.cardReset,
            access.profile && "border-t border-border",
          )}
        >
          <AppearancePanel />
        </div>
      ) : null}
    </div>
  );

  const renderOperations = () => (
    <div className={styles.stack} data-settings-domain-stack="operations">
      {access.reports ? <DailyReportPanel /> : null}
      {access.phone ? (
        <PhoneReputationPanel canManage={access.phoneManage} />
      ) : null}
    </div>
  );

  const renderConnections = () => (
    <div className={styles.stack} data-settings-domain-stack="connections">
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
    <div className={styles.stack} data-settings-domain-stack="intelligence">
      {access.aiKey || access.aiConsent ? (
        <AiKeyPanel
          canManageKey={access.aiKey}
          canManageConsent={access.aiConsent}
        />
      ) : null}
    </div>
  );

  const renderAccess = () => (
    <div className={styles.stack} data-settings-domain-stack="access">
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
    <div className={styles.stack} data-settings-domain-stack="data">
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

  if (mobile) {
    return (
      <div
        data-settings-workspace="v2"
        data-settings-generation="class-aaa"
        data-settings-control-center="true"
        data-settings-layout="mobile"
        data-settings-mobile-pane={mobilePane}
        className="min-h-[calc(100dvh-9rem)] border-y border-border/80 bg-background"
      >
        {mobilePane === "directory" ? (
          <section className="px-3 py-4 sm:px-4">
            <header className="px-1 pb-4">
              <p className="text-base font-semibold tracking-tight">
                {copy("controlCenter")}
              </p>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                {copy("workspaceHint")}
              </p>
            </header>
            <SettingsDirectory
              groups={visibleGroups}
              active={effectiveActive}
              copy={copy}
              mobile
              onSelect={selectGroup}
            />
          </section>
        ) : (
          <section
            data-settings-group-panel={effectiveActive}
            data-settings-domain-canvas="true"
            className="min-h-[calc(100dvh-9rem)]"
          >
            <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-border/80 bg-background/95 px-3 py-3 backdrop-blur">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={copy("backToSettings")}
                onClick={() => setMobilePane("directory")}
              >
                <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
              </Button>
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07] text-primary">
                <EffectiveIcon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-tight">
                  {copy(effectiveActive)}
                </h2>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {copy(effectiveGroup.descriptionKey)}
                </p>
              </div>
            </header>
            <div className="mx-auto w-full max-w-3xl px-4 pb-10">
              {content}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div
      data-settings-workspace="v2"
      data-settings-generation="class-aaa"
      data-settings-control-center="true"
      data-settings-layout="desktop"
      className="h-[calc(100dvh-10.5rem)] min-h-[36rem] border-y border-border/80 bg-background"
    >
      <div className="grid h-full min-h-0 overflow-hidden md:grid-cols-[16.25rem_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-e border-border/80 bg-muted/[0.025] px-3 py-4">
          <div className="px-2 pb-4">
            <p className="text-base font-semibold tracking-tight text-foreground">
              {copy("controlCenter")}
            </p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {copy("workspaceHint")}
            </p>
          </div>
          <SettingsDirectory
            groups={visibleGroups}
            active={effectiveActive}
            copy={copy}
            mobile={false}
            onSelect={selectGroup}
          />
        </aside>

        <section
          data-settings-group-panel={effectiveActive}
          data-settings-domain-canvas="true"
          aria-labelledby={`settings-control-center-${effectiveActive}`}
          className="flex min-h-0 min-w-0 flex-col"
        >
          <header className="shrink-0 border-b border-border/75 bg-background/92 px-6 py-5 backdrop-blur">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/[0.07] text-primary">
                <EffectiveIcon className="size-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2
                  id={`settings-control-center-${effectiveActive}`}
                  className="text-xl font-semibold tracking-tight"
                >
                  {copy(effectiveActive)}
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {copy(effectiveGroup.descriptionKey)}
                </p>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-5xl px-6 pb-12">{content}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
