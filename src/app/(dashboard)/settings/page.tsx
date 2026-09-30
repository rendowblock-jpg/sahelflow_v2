import type { Metadata } from "next";

import DashboardPage from "@/app/(dashboard)/dashboard/page";
import { SettingsModal } from "@/components/settings/settings-modal";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { getI18n } from "@/lib/i18n-server";
import { resolveSettingsWorkspaceProps } from "@/lib/settings/workspace-access";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("settings.metaTitle") };
}

/**
 * A direct load of /settings (refresh, deep link, bookmark, the /profile
 * alias).
 *
 * Settings is never an in-app page: in-app navigation is intercepted by
 * `@modal/(.)settings`, and a direct load opens the same Settings window over
 * the dashboard, closing onto it. Both share every authority decision through
 * `resolveSettingsWorkspaceProps`.
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
    <>
      <div inert aria-hidden="true" data-settings-backdrop-page="dashboard">
        <DashboardPage />
      </div>
      <SettingsModal
        title={t("nav.settings")}
        description={t("settings.subtitle")}
        closeHref="/dashboard"
      >
        <SettingsWorkspace
          key={initialGroup ?? "default"}
          variant="modal"
          access={access}
          initialGroup={initialGroup}
          integrations={integrations}
        />
      </SettingsModal>
    </>
  );
}
