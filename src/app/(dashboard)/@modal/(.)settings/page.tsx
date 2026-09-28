import { SettingsModal } from "@/components/settings/settings-modal";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { getI18n } from "@/lib/i18n-server";
import { resolveSettingsWorkspaceProps } from "@/lib/settings/workspace-access";

export const dynamic = "force-dynamic";

/**
 * Settings as a modal over the page the seller was on.
 *
 * Intercepts in-app navigation to /settings (sidebar, account menu, the `S`
 * shortcut, deep links from other surfaces). The URL still reads /settings, so
 * the modal is shareable and a refresh lands on the full-page route. Authority
 * is resolved exactly like the full page.
 */
export default async function SettingsModalPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;
  const { access, integrations, initialGroup } =
    await resolveSettingsWorkspaceProps(params.group);

  return (
    <SettingsModal title={t("nav.settings")} description={t("settings.subtitle")}>
      <SettingsWorkspace
        key={initialGroup ?? "default"}
        variant="modal"
        access={access}
        initialGroup={initialGroup}
        integrations={integrations}
      />
    </SettingsModal>
  );
}
