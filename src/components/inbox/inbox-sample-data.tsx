"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isDemoId } from "@/lib/demo/demo-tag";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * F-0030: sample (demo) data in the seller's inbox says what it is, and there is
 * one safe way to remove it.
 *
 * The tag is the id prefix the demo lifecycle deletes by (FD-052/FD-054). The
 * counts in the confirm dialog and the removal both go through the existing
 * `/api/demo-data` route (GET status, DELETE), which deletes only tagged rows.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

/** The "demo removal is blocked by real records" code of `/api/demo-data` (FD-054). */
const REMOVAL_BLOCKED_CODE = "DEMO_REMOVAL_BLOCKED_BY_REFERENCES";

export function SampleBadge({
  conversationId,
  t,
  className,
}: {
  conversationId: string;
  t: T;
  className?: string;
}) {
  if (!isDemoId(conversationId)) return null;
  return (
    <Badge
      variant="outline"
      data-inbox-sample-badge=""
      title={t("inbox.sample.badgeHint")}
      className={cn("shrink-0 text-muted-foreground", className)}
    >
      {t("inbox.sample.badge")}
    </Badge>
  );
}

type SampleCounts = {
  conversations: number;
  orders: number;
  customers: number;
  products: number;
};

type StatusBody = {
  loaded?: boolean;
  counts?: Partial<Record<keyof SampleCounts, number>>;
};

async function readStatus(signal?: AbortSignal): Promise<StatusBody | null> {
  const response = await fetch("/api/demo-data", {
    cache: "no-store",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) return null;
  return (await response.json()) as StatusBody;
}

function countOf(status: StatusBody, key: keyof SampleCounts): number {
  const value = status.counts?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function readFailureCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { code?: string };
    return body.code ?? null;
  } catch {
    return null;
  }
}

/**
 * Inbox list footer notice + the remove control. It renders only while the list
 * really holds sample rows, and it asks the server nothing until the seller
 * clicks (the status read is the expensive part, and a shop with no sample data
 * must not pay for it on every inbox visit). The click reads the live counts.
 */
export function SampleDataFooter({
  hasRealRows,
  sampleRowCount,
  t,
  onRemoved,
}: {
  /** The list holds at least one real (untagged) conversation. */
  hasRealRows: boolean;
  /** Sample rows in the loaded list (archived ones included). */
  sampleRowCount: number;
  t: T;
  /** Refresh the lists after the sample data is gone. */
  onRemoved: () => void;
}) {
  const [removed, setRemoved] = useState(false);
  const [counts, setCounts] = useState<SampleCounts | null>(null);
  const [checking, setChecking] = useState(false);

  // Once the refreshed list holds no sample row, forget the local "removed" so
  // sample data loaded again later is shown again (derived state, no effect).
  if (removed && sampleRowCount === 0) setRemoved(false);

  // Fresh counts at click time: the dialog must state what is there NOW.
  const askToRemove = useCallback(async () => {
    setChecking(true);
    try {
      const status = await readStatus();
      if (!status) {
        toast.error(t("inbox.sample.failed"));
        return;
      }
      if (status.loaded !== true) {
        // Already gone (removed from Settings or another window): just refresh.
        setRemoved(true);
        onRemoved();
        return;
      }
      setCounts({
        conversations: countOf(status, "conversations"),
        orders: countOf(status, "orders"),
        customers: countOf(status, "customers"),
        products: countOf(status, "products"),
      });
    } catch {
      toast.error(t("inbox.sample.failed"));
    } finally {
      setChecking(false);
    }
  }, [onRemoved, t]);

  const remove = useCallback(async () => {
    try {
      const response = await fetch("/api/demo-data", {
        method: "DELETE",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const code = await readFailureCode(response);
        toast.error(
          code === REMOVAL_BLOCKED_CODE
            ? t("inbox.sample.blocked")
            : t("inbox.sample.failed"),
        );
        return;
      }
      setRemoved(true);
      toast.success(t("inbox.sample.removed"));
      onRemoved();
    } catch {
      toast.error(t("inbox.sample.failed"));
    }
  }, [onRemoved, t]);

  if (sampleRowCount === 0 || removed) return null;

  const description: ReactNode = counts ? (
    <>
      <span className="block">{t("inbox.sample.confirmIntro")}</span>
      <span className="mt-2 block font-medium text-foreground">
        <span className="block">
          {t("inbox.sample.count.conversations", { count: counts.conversations })}
        </span>
        <span className="block">
          {t("inbox.sample.count.orders", { count: counts.orders })}
        </span>
        <span className="block">
          {t("inbox.sample.count.customers", { count: counts.customers })}
        </span>
        <span className="block">
          {t("inbox.sample.count.products", { count: counts.products })}
        </span>
      </span>
    </>
  ) : null;

  return (
    <div
      data-inbox-sample-footer=""
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/60 px-3 py-2"
    >
      <p className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
        {t(hasRealRows ? "inbox.sample.mixed" : "inbox.sample.only")}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={checking}
        onClick={() => void askToRemove()}
      >
        {checking ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 className="size-4" aria-hidden="true" />
        )}
        {t("inbox.sample.remove")}
      </Button>
      <ConfirmDialog
        open={counts !== null}
        onOpenChange={(open) => {
          if (!open) setCounts(null);
        }}
        title={t("inbox.sample.confirmTitle")}
        description={description}
        confirmLabel={t("inbox.sample.remove")}
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
