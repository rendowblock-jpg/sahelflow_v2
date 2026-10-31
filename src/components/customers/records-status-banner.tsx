"use client";

import { ListStatusBanner } from "@/components/orders/list-status-banner";
import { StateView } from "@/components/shared/state-view";
import { useI18n } from "@/hooks/use-i18n";
import { useOnlineStatus } from "@/hooks/use-online-status";

/** The thin strip at the top of a customer or product detail page while offline: details stay, writes pause. */
export function RecordsOfflineBanner({ kind }: { kind: "customer" | "product" }) {
  const { t } = useI18n();
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <StateView
      kind="offline"
      description={t(kind === "customer" ? "cpDetail.offline.customerBanner" : "cpDetail.offline.productBanner")}
      testId="detail-offline-banner"
    />
  );
}

/**
 * Strip above the customers and products lists. Offline uses this folder's own sentence (the orders banner talks
 * about status changes); the partial branch (a refresh failed, rows kept, Retry) is the shared ListStatusBanner.
 */
export function RecordsListStatusBanner({
  error,
  rows,
  onRefresh,
}: {
  error: unknown;
  rows: readonly unknown[] | undefined;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const online = useOnlineStatus();
  if (!online) {
    return <StateView kind="offline" description={t("cpDetail.offline.listBanner")} testId="list-offline-banner" />;
  }
  return <ListStatusBanner offline={false} error={error} rows={rows} onRefresh={onRefresh} />;
}
