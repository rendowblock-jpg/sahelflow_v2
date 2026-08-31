"use client";

/**
 * Manual "Sync all in transit" toolbar for the deliveries list (R3-d, d4
 * fix #7).
 *
 * - Batch is client-side only (POST /api/delivery/sync per delivery); the
 *   route itself is PR #355-owned and untouched.
 * - NO auto-polling of courier APIs: provider calls cost quota and rate
 *   limits bite — the seller triggers every sync (per-row or this button).
 * - Sync health: the Delivery model carries no syncedAt/checkedAt and the
 *   list projection must stay untouched, so there is no per-row staleness
 *   column. The page-level "last sync" line is a device-local memory of the
 *   last completed bulk run (localStorage), not a server truth.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import {
  collectInTransitDeliveries,
  collectSyncBatch,
  runBulkDeliverySync,
} from "@/components/deliveries/bulk-delivery-sync";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { fetcher } from "@/lib/swr/fetcher";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import { formatRelative } from "@/lib/utils";

const LAST_SYNC_STORAGE_KEY = "sf.deliveries.lastBulkSync";
const LAST_SYNC_EVENT = "sf:deliveries-last-bulk-sync";

function subscribeLastSync(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(LAST_SYNC_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(LAST_SYNC_EVENT, callback);
  };
}

function readLastSync(): string | null {
  try {
    return window.localStorage.getItem(LAST_SYNC_STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberLastSync(stamp: string): void {
  try {
    window.localStorage.setItem(LAST_SYNC_STORAGE_KEY, stamp);
  } catch {
    // Storage unavailable — the toast still reports the run.
  }
  window.dispatchEvent(new Event(LAST_SYNC_EVENT));
}

interface DeliveriesBulkSyncToolbarProps {
  /** Mirrors the delivery workbench `manage` projection (deliveries.manage + orders.read + orders.update). */
  canManage: boolean;
  locale: Locale;
}

export function DeliveriesBulkSyncToolbar({
  canManage,
  locale,
}: DeliveriesBulkSyncToolbarProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  // External store read keeps the last-sync line hydration-safe (server
  // snapshot: null) and reactive across tabs and bulk runs.
  const lastSyncAt = useSyncExternalStore(
    subscribeLastSync,
    readLastSync,
    () => null,
  );

  const handleSyncAll = useCallback(async () => {
    if (!canManage || progress) return;
    setProgress({ done: 0, total: 0 });
    try {
      const rows = await collectInTransitDeliveries((url) => fetcher(url));
      const { batch, capped, syncableTotal } = collectSyncBatch(rows);
      if (batch.length === 0) {
        toast.info(t("deliveries.bulkSync.none"));
        return;
      }

      const outcome = await runBulkDeliverySync(batch, {
        onProgress: (done, total) => setProgress({ done, total }),
      });
      rememberLastSync(new Date().toISOString());

      const descriptionParts: string[] = [];
      if (capped && syncableTotal > batch.length) {
        descriptionParts.push(
          t("deliveries.bulkSync.capped", { n: String(batch.length) }),
        );
      }
      if (outcome.reconciliationRequired > 0) {
        descriptionParts.push(t("deliveries.bulkSync.reconciliationHint"));
      }
      if (outcome.failedRefs.length > 0) {
        descriptionParts.push(outcome.failedRefs.slice(0, 3).join(" · "));
      }
      const description = descriptionParts.join(" — ") || undefined;

      if (outcome.failed === 0) {
        toast.success(
          t("deliveries.bulkSync.success", {
            n: String(outcome.succeeded),
          }),
          { description },
        );
      } else {
        toast.warning(
          t("deliveries.bulkSync.partial", {
            ok: String(outcome.succeeded),
            fail: String(outcome.failed),
          }),
          { description },
        );
      }

      // Syncs can transition orders to delivered — refresh both surfaces.
      await Promise.all([
        mutatePrefix("/api/delivery"),
        mutatePrefix("/api/orders"),
        router.refresh(),
      ]);
    } catch {
      toast.error(t("deliveries.bulkSync.fetchFailed"));
    } finally {
      setProgress(null);
    }
  }, [canManage, progress, router, t]);

  if (!canManage) return null;

  const isRunning = progress !== null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void handleSyncAll()}
        disabled={isRunning}
      >
        {isRunning ? (
          <Loader2 className="size-4 me-1.5 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4 me-1.5" aria-hidden="true" />
        )}
        {isRunning
          ? progress && progress.total > 0
            ? t("deliveries.bulkSync.progress", {
                done: String(progress.done),
                total: String(progress.total),
              })
            : t("deliveries.bulkSync.preparing")
          : t("deliveries.bulkSync.action")}
      </Button>
      {lastSyncAt && !isRunning ? (
        <p className="text-xs text-muted-foreground">
          {t("deliveries.bulkSync.lastSync", {
            time: formatRelative(lastSyncAt, locale),
          })}
        </p>
      ) : null}
    </div>
  );
}
