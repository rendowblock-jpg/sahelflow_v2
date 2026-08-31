"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Bell,
  CheckCheck,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import {
  getNotificationPresentation,
  groupNotificationsByDay,
} from "@/components/notifications/notification-taxonomy";
import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import {
  useNotificationFeed,
  type NotificationCenterItem,
  type NotificationCenterPreference,
  type NotificationFeedState,
} from "@/hooks/use-notification-center";
import { toast } from "@/lib/toast";
import { mutatePrefix } from "@/lib/swr/mutate";

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

  const items = [...feed.notifications, ...extraPages];
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

  const resetPagination = useCallback(() => {
    setExtraPages([]);
    setExtraCursor(null);
  }, []);

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
      resetPagination();
      await revalidateNotifications();
    },
    [resetPagination, t],
  );

  const readAll = useCallback(async () => {
    const response = await fetch("/api/notifications/read-all", {
      method: "POST",
    });
    if (!response.ok) {
      toast.error(t("notifications.markReadFailed"));
      return;
    }
    resetPagination();
    await revalidateNotifications();
  }, [resetPagination, t]);

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
    <main className="app-workspace-content mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("notifications.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("notifications.description")}</p>
        </div>
        <Button variant="outline" size="sm" disabled={feed.unreadCount === 0} onClick={() => void readAll()}>
          <CheckCheck className="me-2 size-4" aria-hidden="true" />
          {t("notifications.markAllRead")}
        </Button>
      </header>

      <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="notification-preferences">
        <h2 id="notification-preferences" className="text-sm font-semibold">{t("notifications.preferences")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {feed.preference ? (
            <>
              <PreferenceToggle label={t("notifications.inboxCategory")} checked={feed.preference.inboxEnabled} onChange={(checked) => void updatePreference({ inboxEnabled: checked })} />
              <PreferenceToggle label={t("notifications.nativeDesktop")} checked={feed.preference.nativeEnabled} onChange={(checked) => void updatePreference({ nativeEnabled: checked })} />
              <PreferenceToggle label={t("notifications.sound")} checked={feed.preference.soundEnabled} onChange={(checked) => void updatePreference({ soundEnabled: checked })} />
              <PreferenceToggle label={t("notifications.preview")} checked={feed.preference.previewEnabled} onChange={(checked) => void updatePreference({ previewEnabled: checked })} />
            </>
          ) : null}
        </div>
        {feed.preference ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void updatePreference(feed.preference?.quietStartMinute === null ? { quietStartMinute: 1320, quietEndMinute: 480 } : { quietStartMinute: null, quietEndMinute: null })}>
              {feed.preference.quietStartMinute === null ? t("notifications.enableQuietHours") : t("notifications.disableQuietHours")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void updatePreference({ mutedUntil: feed.preference?.mutedUntil ? null : new Date(Date.now() + 60 * 60_000).toISOString() })}>
              {feed.preference.mutedUntil ? t("notifications.unmute") : t("notifications.muteHour")}
            </Button>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("notifications.filterLabel")}>
        {filters.map((value) => (
          <Button key={value} variant={filter === value ? "default" : "outline"} size="sm" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {t(`notifications.filter.${value}`)}
          </Button>
        ))}
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
              <RefreshCw className="me-2 size-4" aria-hidden="true" />
              {t("common.retry")}
            </Button>
          }
        />
      ) : null}

      {showSkeleton ? (
        <div
          className="rounded-xl border border-border bg-card"
          role="status"
          aria-busy="true"
          aria-label={t("notifications.loading")}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 border-b border-border p-4 last:border-b-0">
              <Skeleton className="mt-0.5 size-9 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 max-w-60 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : showEmpty ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
            <Bell className="mb-3 size-7 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {caughtUp ? t("notifications.allCaughtUp") : t("notifications.empty")}
            </p>
          </div>
        </div>
      ) : (
        <section
          className="overflow-clip rounded-xl border border-border bg-card"
          aria-busy={loadingMore}
          aria-label={t("notifications.title")}
        >
          {groups.map((group, index) => (
            <div key={group.key} data-day-group={group.key}>
              <div
                role="separator"
                className={`sticky top-0 z-10 bg-card px-4 py-2 text-xs font-semibold text-muted-foreground ${index === 0 ? "rounded-t-xl" : "border-t border-border"}`}
              >
                <span className="capitalize">{group.label}</span>
              </div>
              <ul className="divide-y divide-border">
                {group.items.map((item) => {
                  const presentation = getNotificationPresentation(item);
                  const Icon = presentation.icon;
                  return (
                    <li
                      key={item.id}
                      className={`flex items-start gap-3 p-4 transition-colors motion-reduce:transition-none hover:bg-muted/30 ${item.read ? "" : "bg-primary/[0.045]"}`}
                      data-unread={item.read ? undefined : "true"}
                    >
                      <span
                        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ${presentation.className}`}
                        role="img"
                        aria-label={t(presentation.labelKey)}
                        title={t(presentation.labelKey)}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {!item.read ? <span className="size-2 shrink-0 rounded-full bg-primary" aria-label={t("notifications.unread")} /> : null}
                          <Link
                            className="font-medium hover:underline"
                            href={item.link}
                            onClick={() => {
                              if (item.durable && !item.read) void mutateItem(item.id, "read");
                            }}
                          >
                            {item.title}
                          </Link>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                        <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.createdAt}>{item.time}</time>
                      </div>
                      {item.durable ? (
                        <div className="flex shrink-0 gap-1">
                          {item.archived ? (
                            <Button variant="ghost" size="icon-sm" aria-label={t("notifications.recover")} onClick={() => void mutateItem(item.id, "recover")}>
                              <RotateCcw className="size-4" aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon-sm" aria-label={t("notifications.archive")} onClick={() => void mutateItem(item.id, "archive")}>
                              <Archive className="size-4" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" /> : null}
            {t("notifications.loadMore")}
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function PreferenceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}
