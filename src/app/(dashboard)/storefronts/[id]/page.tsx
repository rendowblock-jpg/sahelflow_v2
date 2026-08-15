import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { StorefrontReleaseHistory } from "@/components/storefront/studio/storefront-release-history";
import { Button } from "@/components/ui/button";
import { db, shopContext } from "@/lib/db";
import {
  getStorefrontStudioContentCopy,
  type StorefrontStudioContentLocale,
} from "@/lib/i18n/storefront-studio-content";
import { getI18n } from "@/lib/i18n-server";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { storefrontService } from "@/lib/storefront/service";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.storefrontEdit") };
}

export const dynamic = "force-dynamic";

/**
 * Storefront management surface.
 *
 * This route owns release/history operations. Visual authoring has one canonical
 * destination at /storefronts/:id/studio so sellers never receive two different
 * Studio shells for the same storefront.
 */
export default async function EditStorefrontPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actorContext = await requireTrustedAction("storefront.manage");
  assertTrustedAction(actorContext, "storefront.publish");
  const { id } = await params;
  const { t, locale } = await getI18n();
  const language = locale as StorefrontStudioContentLocale;
  const copy = (key: Parameters<typeof getStorefrontStudioContentCopy>[1]) =>
    getStorefrontStudioContentCopy(language, key);

  const config = await storefrontService.getStudioDraftById(
    { prisma: db, shop: shopContext },
    id,
  );
  if (!config) notFound();

  return (
    <div className="app-content page-sections">
      <PageHeader
        title={config.name || t("storefronts.editTitle")}
        description={copy("releaseManagement")}
        actions={
          <Button asChild>
            <Link href={`/storefronts/${encodeURIComponent(id)}/studio`}>
              {copy("openStudio")}
              <ExternalLink className="size-4 icon-rtl-flip" aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      <StorefrontReleaseHistory storefrontId={id} />
    </div>
  );
}
