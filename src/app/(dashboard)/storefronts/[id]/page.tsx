import type { Metadata } from "next";

import { StorefrontStudioRoute } from "@/components/storefront/studio/storefront-studio-route";
import { getI18n } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.storefrontEdit") };
}

export const dynamic = "force-dynamic";

/** Backward-compatible edit URL that converges on the one canonical Studio. */
export default async function EditStorefrontPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StorefrontStudioRoute id={id} />;
}
