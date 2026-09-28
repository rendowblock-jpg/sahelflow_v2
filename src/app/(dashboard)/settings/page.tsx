import type { Metadata } from "next";

import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getI18n } from "@/lib/i18n-server";
import { resolveSettingsWorkspaceProps } from "@/lib/settings/workspace-access";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.metaTitle") };
}

/**
 * The full-page Settings route.
 *
 * In-app navigation to /settings is intercepted by `@modal/(.)settings`, so a
 * seller normally meets Settings as a modal over the page they were on. This
 * page renders only on a direct load or refresh of the URL (deep links,
 * bookmarks, the /profile alias) and shares every authority decision with the
 * modal through `resolveSettingsWorkspaceProps`.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const { access, integrations, initialGroup } =
    await resolveSettingsWorkspaceProps(params.group);

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("nav.settings")} description={t("settings.subtitle")} />
      <SettingsWorkspace
        key={initialGroup ?? "default"}
        access={access}
        initialGroup={initialGroup}
        integrations={integrations}
      />
    </div>
  );
}
