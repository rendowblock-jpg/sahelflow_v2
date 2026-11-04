"use client";

import Link from "next/link";
import { SearchX, TriangleAlert, WifiOff } from "lucide-react";

import styles from "@/components/inbox/inbox-v3-workspace.module.css";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

/** Flat skeleton rows at the real row height, shaped like a row (avatar + two lines). No shimmer, no motion. */
export function InboxQueueLoading() {
  const widths = [
    ["58%", "82%"],
    ["44%", "70%"],
    ["66%", "52%"],
    ["50%", "76%"],
    ["60%", "64%"],
  ] as const;
  return (
    <div aria-hidden="true" data-inbox-queue-loading="">
      {widths.map(([name, preview], item) => (
        <div key={item} className={styles.skeletonRow}>
          <span className={styles.skeletonAvatar} />
          <span className={styles.skeletonLines}>
            <span className={styles.skeletonLine} style={{ inlineSize: name }} />
            <span className={styles.skeletonLine} style={{ inlineSize: preview }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A blank ruled page with the three starting steps that exist in the product. */
export function InboxQueueEmpty() {
  const { t } = useI18n();
  const link = "inline-flex items-center underline underline-offset-2 max-sm:min-h-10";
  return (
    <div data-inbox-queue-empty="" className={styles.emptyPage}>
      <h3 className="text-base font-semibold">{t("inbox.list.empty.title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("inbox.list.empty.lead")}</p>
      <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm">
        <li>{t("inbox.list.empty.step.link")}</li>
        <li>
          <Link href="/imports" className={link}>
            {t("inbox.list.empty.step.import")}
          </Link>
        </li>
        <li>
          <Link href="/storefronts" className={link}>
            {t("inbox.list.empty.step.storefront")}
          </Link>
        </li>
      </ol>
    </div>
  );
}

/** The search found nothing: say what was searched and offer one way out (clear it). */
export function InboxQueueNoResults({ query, onClear }: { query: string; onClear: () => void }) {
  const { t } = useI18n();
  return (
    <div data-inbox-queue-noresults="" className={styles.stateBlock}>
      <span className={styles.stateIcon} aria-hidden="true">
        <SearchX className="size-4" />
      </span>
      <h3 className="text-sm font-semibold">{t("inbox.list.noResults.title", { query })}</h3>
      <p className="text-sm text-muted-foreground">{t("inbox.list.noResults.body")}</p>
      <Button
        type="button"
        variant="outline"
        className={`${styles.action} mt-2 max-sm:min-h-10`}
        onClick={onClear}
      >
        {t("inbox.list.noResults.clear")}
      </Button>
    </div>
  );
}

/**
 * The list failed to load: say what failed, offer one retry (a click, never
 * automatic). When the device itself is offline the title says so instead.
 */
export function InboxQueueError({ onRetry, offline = false }: { onRetry: () => void; offline?: boolean }) {
  const { t } = useI18n();
  const Icon = offline ? WifiOff : TriangleAlert;
  return (
    <div
      role="alert"
      data-inbox-queue-error={offline ? "offline" : "failed"}
      className={styles.stateBlock}
    >
      <span className={styles.stateIcon} aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <h3 className="text-sm font-semibold">
        {offline ? t("inbox.list.offline.title") : t("inbox.list.error.title")}
      </h3>
      <p className="text-sm text-muted-foreground">
        {offline ? t("inbox.list.offline.errorBody") : t("inbox.list.error.body")}
      </p>
      <Button
        type="button"
        variant="outline"
        className={`${styles.action} mt-2 max-sm:min-h-10`}
        onClick={onRetry}
      >
        {t("inbox.list.error.retry")}
      </Button>
    </div>
  );
}

/** The device is offline but the list has saved rows: one calm note above them. */
export function InboxQueueOffline() {
  const { t } = useI18n();
  return (
    <div role="status" data-inbox-queue-offline="" className={styles.offlineNote}>
      <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{t("inbox.list.offline.title")}</p>
        <p className="text-muted-foreground">{t("inbox.list.offline.body")}</p>
      </div>
    </div>
  );
}
