"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  ChevronRight,
  DatabaseBackup,
  Palette,
  PlugZap,
  ShieldCheck,
} from "lucide-react";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { ChangePinPanel } from "@/components/settings/change-pin-panel";
import { CollaborationAdminPanel } from "@/components/settings/collaboration-admin-panel";
import { CommerceIntegrationsPanel } from "@/components/settings/commerce-integrations-panel";
import { CommerceSyncRecoveryPanel } from "@/components/settings/commerce-sync-recovery-panel";
import { DailyReportPanel } from "@/components/settings/daily-report-panel";
import { DangerZonePanel } from "@/components/settings/danger-zone-panel";
import { DeliveryCredentialsPanel } from "@/components/settings/delivery-credentials-panel";
import { DemoDataPanel } from "@/components/settings/demo-data-panel";
import { LicensePanel } from "@/components/settings/license-panel";
import { MetaPixelPanel } from "@/components/settings/meta-pixel-panel";
import { PhoneReputationPanel } from "@/components/settings/phone-reputation-panel";
import { SecurityAuthorityPanel } from "@/components/settings/security-authority-panel";
import { ShopsPanel } from "@/components/settings/shops-panel";
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
  profileManage: boolean;
  security: boolean;
  /** Owner PIN change. The route additionally enforces owner-only authority. */
  changePin: boolean;
  /** Shop lifecycle administration (rename / archive / recover / delete). */
  shopsManage: boolean;
  team: boolean;
  appearance: boolean;
  license: boolean;
  demo: boolean;
  aiKey: boolean;
  aiConsent: boolean;
  /** Meta Pixel + CAPI management surface (FD-061 EX-3); route enforces settings.manage. */
  metaPixelManage: boolean;
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

export type SettingsWorkspaceGroup =
  | "workspace"
  | "operations"
  | "connections"
  | "intelligence"
  | "access"
  | "data";

type GroupDefinition = {
  id: SettingsWorkspaceGroup;
  icon: typeof Palette;
  descriptionKey: SettingsWorkspaceCopyKey;
};

type SettingsCopy = (key: SettingsWorkspaceCopyKey) => string;
type FocusIntent = "detail" | "directory" | null;

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

function groupVisible(
  group: SettingsWorkspaceGroup,
  access: SettingsWorkspaceAccess,
): boolean {
  switch (group) {
    case "workspace":
      return access.profile || access.appearance || access.shopsManage;
    case "operations":
      return access.reports || access.phone;
    case "connections":
      return access.commerceRead || access.commerceManage || access.delivery;
    case "intelligence":
      return access.aiKey || access.aiConsent;
    case "access":
      return (
        access.security || access.changePin || access.team || access.license
      );
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
  compact = false,
  onSelect,
}: {
  groups: GroupDefinition[];
  active: SettingsWorkspaceGroup;
  copy: SettingsCopy;
  mobile: boolean;
  /** Modal rail: icon + label rows; the description lives in the pane header. */
  compact?: boolean;
  onSelect: (group: SettingsWorkspaceGroup) => void;
}) {
  if (compact && !mobile) {
    return (
      <nav
        data-settings-directory="true"
        aria-label={copy("workspaceHint")}
        className="space-y-0.5"
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
              aria-describedby={`settings-group-hint-${group.id}`}
              onClick={() => onSelect(group.id)}
              className={cn(
                "relative flex h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-start text-body-sm outline-none transition-colors duration-150 motion-reduce:transition-none",
                "focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {selected ? (
                <span
                  className="absolute inset-y-2 -start-3 w-0.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              ) : null}
              <Icon
                className={cn("size-4 shrink-0", selected ? "text-foreground" : "text-muted-foreground")}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{copy(group.id)}</span>
              <span id={`settings-group-hint-${group.id}`} className="sr-only">
                {copy(group.descriptionKey)}
              </span>
            </button>
          );
        })}
      </nav>
    );
  }

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
              "group relative w-full rounded-surface text-start outline-none transition-[background-color,color,box-shadow] duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              mobile ? "px-3.5 py-3.5" : "px-3 py-2.5",
              selected && !mobile
                ? "bg-primary-soft text-foreground shadow-xs"
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
                  "flex shrink-0 items-center justify-center rounded-surface border bg-background",
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
  initialGroup,
  variant = "page",
}: {
  integrations: Array<{ platform: string; status: string }>;
  access: SettingsWorkspaceAccess;
  initialGroup?: SettingsWorkspaceGroup;
  /** `modal` fills the intercepted Settings modal instead of the page body. */
  variant?: "page" | "modal";
}) {
  const inModal = variant === "modal";
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const mobile = useMobile();
  const copy: SettingsCopy = (key) => getSettingsWorkspaceCopy(locale, key);
  const visibleGroups = useMemo(
    () => GROUPS.filter((group) => groupVisible(group.id, access)),
    [access],
  );
  const initialVisibleGroup =
    initialGroup && visibleGroups.some((group) => group.id === initialGroup)
      ? initialGroup
      : visibleGroups[0]?.id ?? "workspace";
  const [active, setActive] =
    useState<SettingsWorkspaceGroup>(initialVisibleGroup);
  const [mobilePane, setMobilePane] = useState<"directory" | "detail">(
    initialGroup ? "detail" : "directory",
  );
  const [focusHandoffRevision, setFocusHandoffRevision] = useState(0);
  const directoryRef = useRef<HTMLElement | null>(null);
  const detailRef = useRef<HTMLElement | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusIntentRef = useRef<FocusIntent>(null);
  const breakpointFocusSourceRef = useRef<HTMLElement | null>(null);

  const effectiveGroup =
    visibleGroups.find((group) => group.id === active) ??
    visibleGroups[0] ??
    DEFAULT_GROUP;
  const effectiveActive = effectiveGroup.id;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || media.matches) return;
      if (
        directoryRef.current?.contains(target) ||
        detailRef.current?.contains(target)
      ) {
        setMobilePane("detail");
      }
    };

    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) return;

      if (event.matches && directoryRef.current?.contains(activeElement)) {
        breakpointFocusSourceRef.current = activeElement;
        focusIntentRef.current = "detail";
        setMobilePane("detail");
        setFocusHandoffRevision((revision) => revision + 1);
        return;
      }

      if (!event.matches && backButtonRef.current?.contains(activeElement)) {
        breakpointFocusSourceRef.current = activeElement;
        focusIntentRef.current = "directory";
        setMobilePane("directory");
        setFocusHandoffRevision((revision) => revision + 1);
      }
    };

    document.addEventListener("focusin", handleFocusIn, true);
    media.addEventListener("change", handleBreakpointChange);
    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      media.removeEventListener("change", handleBreakpointChange);
    };
  }, [effectiveActive]);

  useLayoutEffect(() => {
    const intent = focusIntentRef.current;
    if (!intent) return;

    const source = breakpointFocusSourceRef.current;
    const currentActive = document.activeElement;
    if (
      source &&
      currentActive !== source &&
      currentActive !== document.body
    ) {
      focusIntentRef.current = null;
      breakpointFocusSourceRef.current = null;
      return;
    }

    if (intent === "detail" && mobilePane === "detail") {
      detailHeadingRef.current?.focus();
      focusIntentRef.current = null;
      breakpointFocusSourceRef.current = null;
      return;
    }

    if (intent === "directory" && (!mobile || mobilePane === "directory")) {
      directoryRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-settings-group="${effectiveActive}"]`,
        )
        ?.focus();
      focusIntentRef.current = null;
      breakpointFocusSourceRef.current = null;
    }
  }, [effectiveActive, focusHandoffRevision, mobile, mobilePane]);

  useEffect(() => {
    if (initialGroup !== "workspace") return;
    document
      .getElementById("settings-profile")
      ?.scrollIntoView({ block: "start" });
  }, [initialGroup]);

  const selectGroup = (group: SettingsWorkspaceGroup) => {
    breakpointFocusSourceRef.current = null;
    setActive(group);
    setMobilePane("detail");
    if (mobile) focusIntentRef.current = "detail";
  };

  const returnToDirectory = () => {
    breakpointFocusSourceRef.current = null;
    focusIntentRef.current = "directory";
    setMobilePane("directory");
  };

  const renderWorkspace = () => (
    <div className={styles.stack} data-settings-domain-stack="workspace">
      {access.profile ? (
        <div id="settings-profile" className={styles.cardReset}>
          <ProfileEditor canManage={access.profileManage} />
        </div>
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
      {access.shopsManage ? (
        <div
          id="settings-tab-shops"
          className={cn(
            styles.cardReset,
            (access.profile || access.appearance) && "border-t border-border",
          )}
        >
          <ShopsPanel />
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
      {access.metaPixelManage ? <MetaPixelPanel /> : null}
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
      {access.changePin ? <ChangePinPanel /> : null}
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

  return (
    <div
      data-settings-workspace="v2"
      data-settings-generation="class-aaa"
      data-settings-control-center="true"
      data-settings-layout={mobile ? "mobile" : "desktop"}
      data-settings-mobile-pane={mobile ? mobilePane : undefined}
      data-settings-variant={variant}
      className={cn(
        styles.controlCenter,
        "bg-background",
        inModal
          ? "h-full min-h-0 flex-1"
          : cn(
              "border-y border-border/80",
              mobile
                ? "min-h-[calc(100dvh-9rem)]"
                : "h-[calc(100dvh-10.5rem)] min-h-[36rem]",
            ),
      )}
    >
      <div
        className={cn(
          "min-h-0 overflow-hidden",
          mobile
            ? inModal
              ? "h-full overflow-y-auto"
              : "min-h-[calc(100dvh-9rem)]"
            : "grid h-full md:grid-cols-[15.625rem_minmax(0,1fr)]",
        )}
      >
        <aside
          ref={directoryRef}
          className={cn(
            mobile
              ? mobilePane === "directory"
                ? "block px-3 py-4 sm:px-4"
                : "hidden"
              : "min-h-0 overflow-y-auto border-e border-border bg-sidebar px-3 py-4",
          )}
        >
          <div className={mobile ? "px-1 pb-4" : inModal ? "px-2.5 pb-4 pt-1" : "px-2 pb-4"}>
            <p
              className={cn(
                "text-foreground",
                inModal && !mobile ? "text-title-2" : "text-title-3",
              )}
            >
              {copy("controlCenter")}
            </p>
            {inModal && !mobile ? null : (
              <p
                className={cn(
                  "mt-1 text-body-sm text-muted-foreground",
                  mobile ? "max-w-xl" : undefined,
                )}
              >
                {copy("workspaceHint")}
              </p>
            )}
          </div>
          <SettingsDirectory
            groups={visibleGroups}
            active={effectiveActive}
            copy={copy}
            mobile={mobile}
            compact={inModal}
            onSelect={selectGroup}
          />
        </aside>

        <section
          ref={detailRef}
          data-settings-group-panel={effectiveActive}
          data-settings-domain-canvas="true"
          aria-labelledby={`settings-control-center-${effectiveActive}`}
          className={cn(
            "min-w-0",
            mobile
              ? mobilePane === "detail"
                ? "block min-h-[calc(100dvh-9rem)]"
                : "hidden"
              : "flex min-h-0 flex-col",
          )}
        >
          <header
            className={cn(
              "relative flex items-start gap-3 border-b border-border bg-background",
              mobile
                ? "sticky top-0 z-10 px-3 py-3"
                : cn("shrink-0 px-8 py-5", inModal && "pe-16"),
            )}
          >
            <Button
              ref={backButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={copy("backToSettings")}
              aria-hidden={mobile ? undefined : true}
              tabIndex={mobile ? 0 : -1}
              className={cn(
                !mobile &&
                  "pointer-events-none absolute size-px overflow-hidden opacity-0",
              )}
              onClick={returnToDirectory}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
            {mobile ? (
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-surface bg-muted text-foreground">
                <EffectiveIcon className="size-4" aria-hidden="true" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2
                ref={detailHeadingRef}
                id={`settings-control-center-${effectiveActive}`}
                data-settings-detail-heading="true"
                tabIndex={-1}
                className="text-title-2 outline-none"
              >
                {copy(effectiveActive)}
              </h2>
              <p className="mt-0.5 max-w-prose text-body-sm text-muted-foreground">
                {copy(effectiveGroup.descriptionKey)}
              </p>
            </div>
          </header>

          <div className={mobile ? undefined : "min-h-0 flex-1 overflow-y-auto"}>
            <div
              className={cn(
                "w-full",
                mobile ? "mx-auto max-w-3xl px-4 pb-10" : "max-w-3xl px-8 pb-12",
              )}
            >
              {content}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}