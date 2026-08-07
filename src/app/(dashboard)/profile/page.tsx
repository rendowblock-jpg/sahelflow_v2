import type { Metadata } from "next";

import { ProfileEditor } from "@/components/profile/profile-editor";
import { PageHeader } from "@/components/shared/page-header";
import { getI18n } from "@/lib/i18n-server";
import {
  requireTrustedAction,
  trustedActionAllowed,
} from "@/lib/identity/authorization";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("profile.title") };
}
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const actorContext = await requireTrustedAction("settings.read");
  const { t } = await getI18n();
  const canManage = trustedActionAllowed(
    actorContext,
    "settings.manage",
    { shopId: actorContext.shop.shopId },
  );

  return (
    <div className="app-content page-sections">
      <PageHeader title={t("profile.title")} description={t("profile.description")} />
      <ProfileEditor canManage={canManage} />
    </div>
  );
}
