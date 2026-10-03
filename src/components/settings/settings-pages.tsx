"use client";

import type { ReactNode } from "react";
import {
  Bot,
  CircleUserRound,
  DatabaseBackup,
  FlaskConical,
  KeyRound,
  LockKeyhole,
  Megaphone,
  Newspaper,
  Palette,
  PhoneCall,
  ShoppingBag,
  Store,
  TriangleAlert,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { GeminiRuntimePanel } from "@/components/settings/gemini-runtime-panel";
import { AppearancePanel } from "@/components/settings/appearance-panel";
import { BackupRestorePanel } from "@/components/settings/backup-restore-panel";
import { ChangePinPanel } from "@/components/settings/change-pin-panel";
import { CollaborationAdminPanel } from "@/components/settings/collaboration-admin-panel";
import { CommerceIntegrationsPanel } from "@/components/settings/commerce-integrations-panel";
import { CommerceSyncRecoveryPanel } from "@/components/settings/commerce-sync-recovery-panel";
import { GoogleSheetsBridgePanel } from "@/components/settings/google-sheets-bridge-panel";
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
import type {
  SettingsPageId,
  SettingsSectionId,
  SettingsWorkspaceAccess,
} from "@/components/settings/settings-ia";
import type { SettingsWorkspaceCopyKey } from "@/lib/i18n/settings-workspace";

export {
  resolveSettingsTarget,
  SETTINGS_PAGE_IDS,
  SETTINGS_SECTIONS,
  settingsPageMatches,
} from "@/components/settings/settings-ia";
export type {
  SettingsPageId,
  SettingsSectionId,
  SettingsWorkspaceAccess,
  SettingsWorkspaceGroup,
} from "@/components/settings/settings-ia";

/**
 * The Settings pages: one page per concern, grouped
 * Account → Shop → Connections → Data. Every page reuses the panel that owns
 * its behaviour (API calls, re-authentication, permissions); this module only
 * decides where it lives, who sees it and how it is found.
 */

export interface SettingsRenderContext {
  access: SettingsWorkspaceAccess;
  integrations: Array<{ platform: string; status: string }>;
}

export interface SettingsPage {
  id: SettingsPageId;
  section: SettingsSectionId;
  icon: LucideIcon;
  label: SettingsWorkspaceCopyKey;
  description: SettingsWorkspaceCopyKey;
  /** Extra search terms (the label and description are always searched). */
  keywords: string;
  /** Tone of the page — "danger" frames destructive controls. */
  tone?: "danger";
  /**
   * The page shows one panel whose opening card header only restates the
   * page title: inside Settings the page header is the one title.
   */
  leadless?: true;
  visible: (access: SettingsWorkspaceAccess) => boolean;
  render: (context: SettingsRenderContext) => ReactNode;
}

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  {
    id: "profile",
    section: "account",
    icon: CircleUserRound,
    label: "pageProfile",
    description: "pageProfileDescription",
    keywords: "name nom اسم photo avatar email phone téléphone هاتف bio",
    visible: (access) => access.profile,
    render: ({ access }) => <ProfileEditor canManage={access.profileManage} />,
  },
  {
    id: "appearance",
    leadless: true,
    section: "account",
    icon: Palette,
    label: "pageAppearance",
    description: "pageAppearanceDescription",
    keywords: "theme thème سمة dark light sombre clair داكن فاتح color couleur لون density densité",
    visible: (access) => access.appearance,
    render: () => <AppearancePanel />,
  },
  {
    id: "security",
    section: "account",
    icon: LockKeyhole,
    label: "pageSecurity",
    description: "pageSecurityDescription",
    keywords: "pin code sessions session جلسة password mot de passe كلمة lock verrou",
    visible: (access) => access.security || access.changePin,
    render: ({ access }) => (
      <>
        {access.security ? <SecurityAuthorityPanel /> : null}
        {access.changePin ? <ChangePinPanel /> : null}
      </>
    ),
  },
  {
    id: "shops",
    section: "shop",
    icon: Store,
    label: "pageShops",
    description: "pageShopsDescription",
    keywords: "shop boutique متجر archive rename renommer delete supprimer",
    visible: (access) => access.shopsManage,
    render: () => <ShopsPanel />,
  },
  {
    id: "reports",
    leadless: true,
    section: "shop",
    icon: Newspaper,
    label: "pageReports",
    description: "pageReportsDescription",
    keywords: "report rapport تقرير daily quotidien يومي whatsapp summary résumé",
    visible: (access) => access.reports,
    render: () => <DailyReportPanel />,
  },
  {
    id: "phone",
    leadless: true,
    section: "shop",
    icon: PhoneCall,
    label: "pagePhone",
    description: "pagePhoneDescription",
    keywords: "phone téléphone هاتف reputation réputation سمعة risk risque fraud fraude",
    visible: (access) => access.phone,
    render: ({ access }) => <PhoneReputationPanel canManage={access.phoneManage} />,
  },
  {
    id: "team",
    section: "shop",
    icon: Users,
    label: "pageTeam",
    description: "pageTeamDescription",
    keywords: "team équipe فريق member membre عضو role rôle دور permission access accès",
    visible: (access) => access.team,
    render: () => (
      <>
        <TeamAccessAuthorityPanel />
        <TeamMembersPanel />
        <CollaborationAdminPanel />
      </>
    ),
  },
  {
    id: "license",
    leadless: true,
    section: "shop",
    icon: KeyRound,
    label: "pageLicense",
    description: "pageLicenseDescription",
    keywords: "license licence ترخيص plan offre خطة activation",
    visible: (access) => access.license,
    render: () => <LicensePanel />,
  },
  {
    id: "commerce",
    section: "connections",
    icon: ShoppingBag,
    label: "pageCommerce",
    description: "pageCommerceDescription",
    keywords: "shopify woocommerce youcan google sheets feuille ورقة sync synchronisation مزامنة store",
    visible: (access) => access.commerceRead || access.commerceManage,
    render: ({ access, integrations }) => (
      <>
        <CommerceIntegrationsPanel
          integrations={integrations}
          canManage={access.commerceManage}
          canSync={access.commerceSync}
        />
        <GoogleSheetsBridgePanel canManage={access.commerceManage} />
        {access.commerceManage ? <CommerceSyncRecoveryPanel /> : null}
      </>
    ),
  },
  {
    id: "delivery",
    leadless: true,
    section: "connections",
    icon: Truck,
    label: "pageDelivery",
    description: "pageDeliveryDescription",
    keywords: "yalidine zr express courier transporteur توصيل api credentials identifiants",
    visible: (access) => access.delivery,
    render: () => <DeliveryCredentialsPanel />,
  },
  {
    id: "meta-pixel",
    leadless: true,
    section: "connections",
    icon: Megaphone,
    label: "pageMetaPixel",
    description: "pageMetaPixelDescription",
    keywords: "meta facebook pixel capi conversions ads publicité إعلانات",
    visible: (access) => access.metaPixelManage,
    render: () => <MetaPixelPanel />,
  },
  {
    id: "ai",
    leadless: true,
    section: "connections",
    icon: Bot,
    label: "pageAi",
    description: "pageAiDescription",
    keywords: "ai ia gemini google key clé مفتاح consent consentement موافقة agent model thinking modèle réflexion",
    visible: (access) => access.aiKey || access.aiConsent,
    render: ({ access }) => (
      <div className="space-y-6">
        <GeminiRuntimePanel canManage={access.aiConsent || access.aiKey} />
        <AiKeyPanel canManageKey={access.aiKey} canManageConsent={access.aiConsent} />
      </div>
    ),
  },
  {
    id: "backup",
    leadless: true,
    section: "data",
    icon: DatabaseBackup,
    label: "pageBackup",
    description: "pageBackupDescription",
    keywords: "backup sauvegarde نسخ restore restaurer استعادة recovery",
    visible: (access) => access.backupRead || access.backupCreate || access.backupRestore,
    render: ({ access }) => (
      <BackupRestorePanel
        canRead={access.backupRead}
        canCreate={access.backupCreate}
        canRestore={access.backupRestore}
      />
    ),
  },
  {
    id: "demo",
    section: "data",
    icon: FlaskConical,
    label: "pageDemo",
    description: "pageDemoDescription",
    keywords: "demo démo تجريبي sample exemple",
    visible: (access) => access.demo,
    render: () => <DemoDataPanel />,
  },
  {
    id: "danger",
    leadless: true,
    section: "data",
    icon: TriangleAlert,
    label: "pageDanger",
    description: "pageDangerDescription",
    keywords: "export exporter تصدير reset réinitialiser إعادة delete supprimer json",
    tone: "danger",
    visible: (access) => access.dataExport || access.dangerReset,
    render: ({ access }) => (
      <DangerZonePanel canExport={access.dataExport} canReset={access.dangerReset} />
    ),
  },
];

