"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  History,
  Inbox,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { NotificationFeedList } from "@/components/notifications/notification-feed-list";
import { NotificationPreferencesPanel } from "@/components/notifications/notification-preferences-panel";
import { groupNotificationsByDay } from "@/components/notifications/notification-taxonomy";
import { PageShell, StateSurface } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import {
  useNotificationFeed,
  type NotificationCenterItem,
  type NotificationCenterPreference,
  type NotificationFeedState,
} from "@/hooks/use-notification-center";
import { toast } from "@/lib/toast";
import { mutatePrefix } from "@/lib/swr/mutate";
import { cn } from "@/lib/utils";

interface PageResponse {
  notifications: NotificationCenterItem[];
  unreadCount: number;
  nextCursor: string | null;
}

const PAGE_LIMIT = 20;

/** Revalidate every mounted notification query (live + this filter view). */
function revalidateNotifications(): Promise<void> {
  return mutatePrefix("/api/notifications");
}

export function NotificationCenterWorkspace() {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<NotificationFeedState>("active");
  const feed = useNotificationFeed(filter);
  // Stable SWR bound mutator (identity-safe for callback dependencies).
  const mutateFeed = feed.mutate;
  const [extraPages, setExtraPages] = useState<NotificationCenterItem[]>([]);
  const [extraCursor, setExtraCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationFilter, setPaginationFilter] =
    useState<NotificationFeedState>(filter);

  // Filter switches restart pagination: drop appended history pages (state
  // adjusted during render — the React-endorsed reset-on-transition pattern).
  if (paginationFilter !== filter) {
    setPaginationFilter(filter);
    setExtraPages([]);
    setExtraCursor(null);
  }

  // Surface fetch failures instead of swallowing them: one toast when a
  // failure streak starts, plus the persistent inline/panel state with retry.
  const previousErrorRef = useRef<unknown>(undefined);
  useEffect(() => {
    const error = feed.error;
    const previous = previousErrorRef.current;
    previousErrorRef.current = error;
    if (error && !previous) {
      toast.error(t("notifications.loadFailed"));
    }
  }, [feed.error, t]);

  // F-13/N-2: the default view shares the live 3s-polled SWR key, so page 1
  // revalidates under our feet while appended pages stay frozen — compose
  // through an id-dedupe instead of raw concatenation (the old array spread
  // could render the same notification twice after a live shift).
  const items = useMemo(() => {
    const seen = new Set<string>();
    const composed: NotificationCenterItem[] = [];
    for (const item of feed.notifications) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      composed.push(item);
    }
    for (const item of extraPages) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      composed.push(item);
    }
    return composed;
  }, [feed.notifications, extraPages]);
  const nextCursor =
    extraPages.length > 0 ? extraCursor : feed.nextCursor;

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const query = new URLSearchParams({
        state: filter,
        limit: String(PAGE_LIMIT),
        cursor: nextCursor,
      });
      const response = await fetch(`/api/notifications?${query}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        toast.error(t("notifications.loadFailed"));
        return;
      }
      const payload = (await response.json()) as PageResponse;
      setExtraPages((current) => [...current, ...payload.notifications]);
      setExtraCursor(payload.nextCursor);
    } catch {
      toast.error(t("notifications.loadFailed"));
    } finally {
      setLoadingMore(false);
    }
  }, [filter, loadingMore, nextCursor, t]);

  const mutateItem = useCallback(
    async (id: string, action: "read" | "archive" | "recover") => {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        toast.error(
          t(
            action === "read"
              ? "notifications.markReadFailed"
              : "notifications.dismissFailed",
          ),
        );
        return;
      }
      // F-13/N-1: single-item actions no longer reset pagination (the old
      // reset threw away every appended history page). The item leaves the
      // appended region locally; the durable projection is revalidated below.
      setExtraPages((current) => current.filter((item) => item.id !== id));
      await revalidateNotifications();
    },
    [t],
  );

  const readAll = useCallback(async () => {
    const response = await fetch("/api/notifications/read-all", {
      method: "POST",
    });
    if (!response.ok) {
      toast.error(t("notifications.markReadFailed"));
      return;
    }
    // F-13/N-1: only the unread view loses membership on mark-all (every
    // item leaves its domain); other filters keep their pages — history no
    // longer collapses back to page 1 after a bulk read.
    if (filter === "unread") {
      setExtraPages([]);
      setExtraCursor(null);
    }
    await revalidateNotifications();
  }, [filter, t]);

  const updatePreference = useCallback(
    async (patch: Record<string, unknown>) => {
      const response = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        toast.error(t("common.error"));
        return;
      }
      const payload = (await response.json()) as {
        preference: NotificationCenterPreference;
      };
      await mutateFeed(
        (current) =>
          current ? { ...current, preference: payload.preference } : current,
        { revalidate: false },
      );
    },
    [mutateFeed, t],
  );

  const filters: NotificationFeedState[] = ["active", "unread", "read", "archived"];
  const groups = groupNotificationsByDay(items, locale, t);
  const showSkeleton = feed.isLoading && items.length === 0;
  const showEmpty = items.length === 0 && !feed.isLoading && !feed.error;
  const caughtUp = filter === "active" || filter === "unread";

  return (
    <PageShell
      title={t("notifications.title")}
      description={t("notifications.description")}
      icon={Bell}
      actions={
        <Button
          variant="outline"
          size="sm"
          disabled={feed.unreadCount === 0}
          onClick={() => void readAll()}
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          {t("notifications.markAllRead")}
        </Button>
      }
    >
      <div className="flex min-w-0 flex-col gap-8 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <div
            className="flex max-w-full items-center gap-1 overflow-x-auto border-b border-border"
            role="group"
            aria-label={t("notifications.filterLabel")}
          >
            {filters.map((value) => {
              const active = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "relative -mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap px-3 text-body-sm transition-colors duration-150 motion-reduce:transition-none",
                    "focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors after:duration-150",
                    active
                      ? "font-medium text-foreground after:bg-primary"
                      : "text-muted-foreground hover:text-foreground after:bg-transparent",
                  )}
                >
                  {t(`notifications.filter.${value}`)}
                  {value === "unread" && feed.unreadCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-soft px-1.5 text-caption font-semibold tabular-nums text-primary">
                      <span dir="ltr">{feed.unreadCount}</span>
                      <span className="sr-only">{t("notifications.unread")}</span>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {feed.error ? (
            <StateSurface
              icon={AlertTriangle}
              tone="danger"
              size={items.length === 0 ? "panel" : "inline"}
              title={t("notifications.loadFailed")}
              description={feed.error.message || t("common.error")}
              live="polite"
              testId="notifications-error"
              actions={
                <Button type="button" variant="outline" size="sm" onClick={() => void mutateFeed()}>
                  <RefreshCw className="size-4" aria-hidden="true" />
                  {t("common.retry")}
                </Button>
              }
            />
          ) : null}

          {showSkeleton ? (
            <div
              className="rounded-surface border border-border bg-card"
              role="status"
              aria-busy="true"
              aria-label={t("notifications.loading")}
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-start gap-3 border-b border-border/60 px-4 py-3.5 last:border-b-0">
                  <Skeleton className="mt-0.5 size-9 rounded-surface" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : showEmpty ? (
            <StateSurface
              icon={caughtUp ? CheckCheck : Inbox}
              tone={caughtUp ? "success" : "neutral"}
              size="panel"
              title={caughtUp ? t("notifications.allCaughtUp") : t("notifications.empty")}
              live="polite"
            />
          ) : items.length > 0 ? (
            <NotificationFeedList
              groups={groups}
              busy={loadingMore}
              onAction={(id, action) => void mutateItem(id, action)}
            />
          ) : null}

          {nextCursor ? (
            <div className="flex justify-center pt-2">
              <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {t("notifications.loadMore")}
              </Button>
            </div>
          ) : items.length > 0 && !feed.error ? (
            <p className="flex items-center justify-center gap-2 pt-2 text-caption text-muted-foreground">
              <History className="size-3.5" aria-hidden="true" />
              {t("notifications.historyEnd")}
            </p>
          ) : null}
        </div>

        <NotificationPreferencesPanel
          preference={feed.preference}
          onChange={(patch) => void updatePreference(patch)}
          className="xl:sticky xl:top-2 xl:w-96 xl:shrink-0"
        />
      </div>
    </PageShell>
  );
}
