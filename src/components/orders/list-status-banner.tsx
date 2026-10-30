"use client";

import { resolveState } from "@/components/shared/resolve-state";
import { StateView } from "@/components/shared/state-view";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";

interface ListStatusBannerProps {
  offline: boolean;
  /** The list hook's error. With rows on screen it means "the refresh failed", not "the list failed". */
  error: unknown;
  rows: readonly unknown[] | undefined;
  onRefresh: () => void;
}

/**
 * The thin strip above a list: offline (writes are paused, saved rows stay readable) or partial (a refresh failed,
 * the rows we hold stay; no clock, the list hooks keep no fetch time). Nothing is drawn when the list is fine, loading, empty or failed with no rows; those are
 * the table's own states.
 */
export function ListStatusBanner({ offline, error, rows, onRefresh }: ListStatusBannerProps) {
  const { t } = useI18n();
  const state = resolveState({ offline, error, data: rows });
  if (state === "offline") {
    return (
      <StateView
        kind="offline"
        description={t("ordersStates.offline.writesPaused")}
        testId="list-offline-banner"
      />
    );
  }
  if (state === "partial") {
    return <StateView kind="partial" onRefresh={onRefresh} testId="list-partial-banner" />;
  }
  return null;
}

/** A list that never loaded: what failed, in the seller's language, and Retry. */
export function ListErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { t } = useI18n();
  const title = t("error.requestFailed");
  const detail = translateServerError(error.message, t, title);
  return (
    <StateView
      kind="error"
      size="inline"
      title={title}
      // An unknown server message comes back as the title itself; the kit's generic line is better than saying it twice.
      description={detail === title ? undefined : detail}
      onRetry={onRetry}
      testId="list-error"
    />
  );
}
