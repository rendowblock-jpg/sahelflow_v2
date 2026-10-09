/**
 * The Settings information architecture as plain data — shared by the client
 * workspace and the server resolver (`lib/settings/workspace-access.ts`), so
 * it carries no JSX and no "use client".
 */
import type { SettingsWorkspaceCopyKey } from "@/lib/i18n/settings-workspace";

export type SettingsWorkspaceAccess = {
  /** A team member's own account: identity, role, access and own PIN. */
  myAccount: boolean;
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

/** The previous six-group model — still accepted in `?group=` deep links. */
export type SettingsWorkspaceGroup =
  | "workspace"
  | "operations"
  | "connections"
  | "intelligence"
  | "access"
  | "data";

export type SettingsSectionId = "account" | "shop" | "connections" | "data";

export type SettingsPageId =
  | "account"
  | "profile"
  | "appearance"
  | "security"
  | "shops"
  | "reports"
  | "phone"
  | "team"
  | "license"
  | "commerce"
  | "delivery"
  | "meta-pixel"
  | "ai"
  | "backup"
  | "demo"
  | "danger";

export const SETTINGS_SECTIONS: ReadonlyArray<{
  id: SettingsSectionId;
  label: SettingsWorkspaceCopyKey;
}> = [
  { id: "account", label: "sectionAccount" },
  { id: "shop", label: "sectionShop" },
  { id: "connections", label: "sectionConnections" },
  { id: "data", label: "sectionData" },
];

export const SETTINGS_PAGE_IDS: readonly SettingsPageId[] = [
  "account",
  "profile",
  "appearance",
  "security",
  "shops",
  "reports",
  "phone",
  "team",
  "license",
  "commerce",
  "delivery",
  "meta-pixel",
  "ai",
  "backup",
  "demo",
  "danger",
];

const GROUP_TO_PAGE: Record<SettingsWorkspaceGroup, SettingsPageId> = {
  workspace: "profile",
  operations: "reports",
  connections: "commerce",
  intelligence: "ai",
  access: "security",
  data: "backup",
};

const PAGE_IDS = new Set<string>(SETTINGS_PAGE_IDS);

/** Accept a page id or a legacy group id from `?group=` deep links. */
export function resolveSettingsTarget(value: string | undefined): SettingsPageId | undefined {
  if (!value) return undefined;
  if (PAGE_IDS.has(value)) return value as SettingsPageId;
  return GROUP_TO_PAGE[value as SettingsWorkspaceGroup];
}

/** Accent- and case-insensitive search over label, description and keywords. */
export function settingsPageMatches(
  page: { keywords: string },
  haystack: string,
  query: string,
): boolean {
  const fold = (value: string) =>
    value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const needle = fold(query.trim());
  if (!needle) return true;
  return fold(`${haystack} ${page.keywords}`).includes(needle);
}
