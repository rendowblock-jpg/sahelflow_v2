"use client";

import Link from "next/link";
import {
  Copy,
  ExternalLink,
  Globe,
  History,
  MoreHorizontal,
  PenLine,
  Trash2,
} from "lucide-react";

import { Sparkline } from "@/components/charts/sparkline";
import { StorefrontMiniPreview } from "@/components/storefront/storefront-mini-preview";
import type { StorefrontStudioProduct } from "@/components/storefront/studio/studio-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/use-i18n";
import type { StorefrontConfig } from "@/lib/storefront/service";
import type { StorefrontPerformance } from "@/lib/storefront/storefront-performance";
import { cn, formatDZD, intlLocale } from "@/lib/utils";

function relativeTime(iso: string, locale: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(diffMs / 60_000);
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}

/**
 * One store on the Storefronts page: a live miniature of the real page, its
 * status and address, last-30-day sales from the orders it produced, and the
 * actions a seller takes most (edit, view, copy link, releases).
 */
export function StorefrontCard({
  config,
  products,
  performance,
  canMutate,
  canDelete,
  onCopyLink,
  onDelete,
}: {
  config: StorefrontConfig;
  products: readonly StorefrontStudioProduct[];
  performance: StorefrontPerformance | undefined;
  canMutate: boolean;
  canDelete: boolean;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useI18n();
  const studioHref = `/storefronts/${config.id}/studio`;
  const publicHref = `/storefront/${config.slug}`;
  const hasTrend = (performance?.trend ?? []).some((point) => point.value > 0);

  const preview = <StorefrontMiniPreview config={config} products={products} />;

  return (
    <article
      data-storefront-card={config.id}
      className="group/store flex h-full flex-col overflow-hidden rounded-surface border bg-card transition-[border-color,box-shadow] hover:border-primary/35 hover:shadow-(--elevation-2)"
    >
      <div className="relative border-b">
        {preview}
        {canMutate ? (
          // A sibling overlay, not a wrapper: the miniature contains the
          // store's own links, and links cannot nest.
          <Link
            href={studioHref}
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0"
          />
        ) : null}
        <span
          className={cn(
            "absolute start-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-semibold shadow-(--elevation-1)",
            config.isActive
              ? "bg-success text-success-foreground"
              : "bg-background text-muted-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full",
              config.isActive ? "bg-current" : "bg-muted-foreground",
            )}
          />
          {config.isActive
            ? t("storefront.list.live")
            : t("storefront.list.offline")}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="min-w-0">
          <h3 dir="auto" className="truncate text-title-3 font-semibold">
            {config.name}
          </h3>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-body-sm text-muted-foreground">
            <Globe className="size-3.5 shrink-0" aria-hidden="true" />
            <bdi dir="ltr" className="truncate font-mono text-caption">
              {publicHref}
            </bdi>
            <button
              type="button"
              onClick={onCopyLink}
              aria-label={t("storefront.list.copyLink")}
              title={t("storefront.list.copyLink")}
              className="ms-auto flex size-7 shrink-0 items-center justify-center rounded-control outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Copy className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {!config.isActive ? (
            <p className="mt-2 text-caption text-muted-foreground">
              {t("storefront.list.offlineHint")}
            </p>
          ) : null}
        </div>

        <div className="rounded-control bg-muted/40 p-3">
          <p className="mb-2 text-caption font-medium text-muted-foreground">
            {t("storefronts.kpi.last30")}
          </p>
          <dl className="grid grid-cols-3 gap-3">
            <div className="min-w-0">
              <dt className="truncate text-caption text-muted-foreground">
                {t("storefront.list.orders")}
              </dt>
              <dd className="mt-0.5 text-title-3 font-semibold tabular-nums">
                {performance?.orders ?? 0}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-caption text-muted-foreground">
                {t("storefront.list.revenue")}
              </dt>
              <dd className="mt-0.5 truncate text-title-3 font-semibold tabular-nums">
                {formatDZD(performance?.revenue ?? 0, locale)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="truncate text-caption text-muted-foreground">
                {t("storefront.list.products")}
              </dt>
              <dd className="mt-0.5 text-title-3 font-semibold tabular-nums">
                {config.productIds.length}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
            {performance?.lastOrderAt
              ? t("storefront.list.lastOrder", {
                  when: relativeTime(performance.lastOrderAt, locale),
                })
              : t("storefront.list.noOrdersYet")}
          </p>
          {hasTrend && performance ? (
            <div className="w-24 shrink-0" aria-hidden="true">
              <Sparkline data={performance.trend} height={24} zeroBaseline />
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        {canMutate ? (
          <Button asChild size="sm" className="flex-1">
            <Link href={studioHref}>
              <PenLine className="size-3.5" aria-hidden="true" />
              {t("storefront.list.openStudio")}
            </Link>
          </Button>
        ) : null}
        <Button
          asChild
          size="sm"
          variant="outline"
          className={canMutate ? undefined : "flex-1"}
        >
          <a href={publicHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t("storefront.list.viewStore")}
          </a>
        </Button>
        {canMutate || canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("storefront.list.more")}
                title={t("storefront.list.more")}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onCopyLink}>
                <Copy className="size-4" aria-hidden="true" />
                {t("storefront.list.copyLink")}
              </DropdownMenuItem>
              {canMutate ? (
                <DropdownMenuItem asChild>
                  <Link href={`/storefronts/${config.id}/history`}>
                    <History className="size-4" aria-hidden="true" />
                    {t("storefront.list.releases")}
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {canDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    {t("storefront.list.delete")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </article>
  );
}
