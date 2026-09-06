"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Bell,
  BellOff,
  CheckCheck,
  Clock3,
  Eye,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
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

/** Local 24h clock label for a minute-of-day preference (PII-free). */
function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Localized time-of-day label for a mute deadline (PII-free). */
function formatDeadline(iso: string, locale: "ar" | "en" | "fr"): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
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
  const preference = feed.preference;

  return (
    <main className="app-workspace-content mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("notifications.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("notifications.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          {feed.unreadCount > 0 ? (
            <span
              className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-2xs font-semibold tabular-nums text-primary"
              data-testid="notifications-unread-pill"
            >
              {t("notifications.unreadCount", { count: feed.unreadCount })}
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={feed.unreadCount === 0}
            onClick={() => void readAll()}
          >
            <CheckCheck className="me-2 size-4" aria-hidden="true" />
            {t("notifications.markAllRead")}
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="notification-preferences">
        <div className="flex items-start gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <SlidersHorizontal className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="notification-preferences" className="text-sm font-semibold">{t("notifications.preferences")}</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">{t("notifications.preferencesDescription")}</p>
          </div>
        </div>
        {preference ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <PreferenceToggle label={t("notifications.inboxCategory")} checked={preference.inboxEnabled} onChange={(checked) => void updatePreference({ inboxEnabled: checked })} />
              <PreferenceToggle label={t("notifications.nativeDesktop")} checked={preference.nativeEnabled} onChange={(checked) => void updatePreference({ nativeEnabled: checked })} />
              <PreferenceToggle label={t("notifications.sound")} checked={preference.soundEnabled} onChange={(checked) => void updatePreference({ soundEnabled: checked })} />
              <PreferenceToggle label={t("notifications.preview")} checked={preference.previewEnabled} onChange={(checked) => void updatePreference({ previewEnabled: checked })} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
              <PreferenceChip icon={Clock3}>
                {preference.quietStartMinute !== null && preference.quietEndMinute !== null ? (
                  t("notifications.quietHoursWindow", {
                    start: formatMinute(preference.quietStartMinute),
                    end: formatMinute(preference.quietEndMinute),
                  })
                ) : (
                  t("notifications.quietHoursOff")
                )}
              </PreferenceChip>
              {preference.mutedUntil ? (
                <PreferenceChip icon={BellOff}>
                  {t("notifications.mutedUntil", {
                    time: formatDeadline(preference.mutedUntil, locale),
                  })}
                </PreferenceChip>
              ) : null}
              <PreferenceChip icon={History}>
                {t("notifications.retentionNote", { days: preference.retentionDays })}
              </PreferenceChip>
              <span className="grow" />
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() =>
                  void updatePreference(
                    preference.quietStartMinute === null
                      ? { quietStartMinute: 1320, quietEndMinute: 480 }
                      : { quietStartMinute: null, quietEndMinute: null },
                  )
                }
              >
                {preference.quietStartMinute === null ? t("notifications.enableQuietHours") : t("notifications.disableQuietHours")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() =>
                  void updatePreference({
                    mutedUntil: preference.mutedUntil
                      ? null
                      : new Date(Date.now() + 60 * 60_000).toISOString(),
                  })
                }
              >
                {preference.mutedUntil ? t("notifications.unmute") : t("notifications.muteHour")}
              </Button>
            </div>
          </>
        ) : (
          <div
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            role="status"
            aria-busy="true"
            aria-label={t("notifications.loading")}
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11 rounded-lg" />
            ))}
          </div>
        )}
      </section>

      <div
        className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-muted/30 p-1"
        role="group"
        aria-label={t("notifications.filterLabel")}
      >
        {filters.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filter === value
                ? "bg-card font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
            }`}
          >
            {t(`notifications.filter.${value}`)}
            {value === "unread" && feed.unreadCount > 0 ? (
              <span className="ms-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-2xs font-semibold leading-none tabular-nums text-primary-foreground">
                {feed.unreadCount}
                <span className="sr-only">{t("notifications.unread")}</span>
              </span>
            ) : null}
          </button>
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
              </div>
            </div>
          ))}
        </div>
      ) : showEmpty ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
            <span
              className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted/50"
              aria-hidden="true"
            >
              <Bell className="size-5 text-muted-foreground/60" />
            </span>
            <p className="text-sm text-muted-foreground">
              {caughtUp ? t("notifications.allCaughtUp") : t("notifications.empty")}
            </p>
          </div>
        </div>
      ) : (
        <section
          className="overflow-clip rounded-xl border border-border bg-card shadow-sm"
          aria-busy={loadingMore}
          aria-label={t("notifications.title")}
        >
          {groups.map((group, index) => (
            <div key={group.key} data-day-group={group.key}>
              <h3
                className={`sticky top-0 z-10 bg-card/90 px-4 py-2 text-2xs font-semibold tracking-wide text-muted-foreground backdrop-blur-sm ${index === 0 ? "rounded-t-xl" : "border-t border-border/60"}`}
              >
                {group.label}
              </h3>
              <ul className="divide-y divide-border/60">
                {group.items.map((item) => {
                  const presentation = getNotificationPresentation(item);
                  const Icon = presentation.icon;
                  return (
                    <li
                      key={item.id}
                      className={`group relative flex items-start gap-3 p-4 transition-colors motion-reduce:transition-none hover:bg-muted/25 ${item.read ? "" : "bg-primary/[0.06]"}`}
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
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {item.read ? null : (
                            <>
                              <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                              <span className="sr-only">{t("notifications.unread")}</span>
                            </>
                          )}
                          <Link
                            className="font-medium hover:underline hover:underline-offset-2"
                            href={item.link}
                            onClick={() => {
                              if (item.durable && !item.read) void mutateItem(item.id, "read");
                            }}
                          >
                            {item.title}
                          </Link>
                          <time className="ms-auto text-2xs tabular-nums text-muted-foreground" dateTime={item.createdAt}>{item.time}</time>
                        </div>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                      </div>
                      {item.durable ? (
                        <div className="flex shrink-0 gap-1 opacity-100 transition-opacity focus-within:opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100 motion-reduce:transition-none">
                          {!item.read ? (
                            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={t("notifications.markRead")} onClick={() => void mutateItem(item.id, "read")}>
                              <Eye className="size-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                          {item.archived ? (
                            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={t("notifications.recover")} onClick={() => void mutateItem(item.id, "recover")}>
                              <RotateCcw className="size-4" aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon-sm" className="rounded-full" aria-label={t("notifications.archive")} onClick={() => void mutateItem(item.id, "archive")}>
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
          <Button variant="outline" className="rounded-full" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" /> : null}
            {t("notifications.loadMore")}
          </Button>
        </div>
      ) : items.length > 0 && !feed.error ? (
        <div className="flex items-center gap-3 text-2xs text-muted-foreground" aria-hidden="true">
          <span className="h-px flex-1 bg-border/60" />
          <History className="size-3.5" />
          <span className="h-px flex-1 bg-border/60" />
          <span className="sr-only">{t("notifications.historyEnd")}</span>
        </div>
      ) : null}
    </main>
  );
}

function PreferenceToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border bg-muted/25 px-3 py-2 text-sm transition-colors motion-reduce:transition-none hover:bg-muted/40">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function PreferenceChip({ icon: Icon, children }: { icon: typeof Clock3; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/25 px-2.5 py-1 text-2xs text-muted-foreground">
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}
