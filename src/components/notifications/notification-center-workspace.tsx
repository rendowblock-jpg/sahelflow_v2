"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Archive, Bell, CheckCheck, Inbox, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import type {
  NotificationCenterItem,
  NotificationCenterPreference,
} from "@/hooks/use-notification-center";

type StateFilter = "active" | "unread" | "read" | "archived";

interface PageResponse {
  notifications: NotificationCenterItem[];
  unreadCount: number;
  nextCursor: string | null;
  preference: NotificationCenterPreference;
}

export function NotificationCenterWorkspace() {
  const { t } = useI18n();
  const [items, setItems] = useState<NotificationCenterItem[]>([]);
  const [filter, setFilter] = useState<StateFilter>("active");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preference, setPreference] = useState<NotificationCenterPreference | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    try {
      await fetch("/api/notifications/sync", { method: "POST" });
      const query = new URLSearchParams({ state: filter, limit: "20" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/notifications?${query}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as PageResponse;
      setItems((current) => (cursor ? [...current, ...payload.notifications] : payload.notifications));
      setNextCursor(payload.nextCursor);
      setUnreadCount(payload.unreadCount);
      setPreference(payload.preference);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const mutateItem = useCallback(async (id: string, action: "read" | "archive" | "recover") => {
    const response = await fetch(`/api/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (response.ok) await load();
  }, [load]);

  const readAll = useCallback(async () => {
    const response = await fetch("/api/notifications/read-all", { method: "POST" });
    if (response.ok) await load();
  }, [load]);

  const updatePreference = useCallback(async (patch: Record<string, unknown>) => {
    const response = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { preference: NotificationCenterPreference };
    setPreference(payload.preference);
  }, []);

  const filters: StateFilter[] = ["active", "unread", "read", "archived"];

  return (
    <main className="app-workspace-content mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("notifications.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("notifications.description")}</p>
        </div>
        <Button variant="outline" size="sm" disabled={unreadCount === 0} onClick={() => void readAll()}>
          <CheckCheck className="me-2 size-4" aria-hidden="true" />
          {t("notifications.readAll")}
        </Button>
      </header>

      <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="notification-preferences">
        <h2 id="notification-preferences" className="text-sm font-semibold">{t("notifications.preferences")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {preference ? (
            <>
              <PreferenceToggle label={t("notifications.inboxCategory")} checked={preference.inboxEnabled} onChange={(checked) => void updatePreference({ inboxEnabled: checked })} />
              <PreferenceToggle label={t("notifications.nativeDesktop")} checked={preference.nativeEnabled} onChange={(checked) => void updatePreference({ nativeEnabled: checked })} />
              <PreferenceToggle label={t("notifications.sound")} checked={preference.soundEnabled} onChange={(checked) => void updatePreference({ soundEnabled: checked })} />
              <PreferenceToggle label={t("notifications.preview")} checked={preference.previewEnabled} onChange={(checked) => void updatePreference({ previewEnabled: checked })} />
            </>
          ) : null}
        </div>
        {preference ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void updatePreference(preference.quietStartMinute === null ? { quietStartMinute: 1320, quietEndMinute: 480 } : { quietStartMinute: null, quietEndMinute: null })}>
              {preference.quietStartMinute === null ? t("notifications.enableQuietHours") : t("notifications.disableQuietHours")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void updatePreference({ mutedUntil: preference.mutedUntil ? null : new Date(Date.now() + 60 * 60_000).toISOString() })}>
              {preference.mutedUntil ? t("notifications.unmute") : t("notifications.muteHour")}
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

      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-live="polite" aria-busy={loading}>
        {items.length === 0 && !loading ? (
          <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
            <Bell className="mb-3 size-7 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("notifications.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 p-4 transition-colors motion-reduce:transition-none hover:bg-muted/30">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Inbox className="size-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!item.read ? <span className="size-2 rounded-full bg-primary" aria-label={t("notifications.unread")} /> : null}
                    <Link className="font-medium hover:underline" href={item.link} onClick={() => void mutateItem(item.id, "read")}>{item.title}</Link>
                    <Badge variant="secondary">{t("notifications.inboxCategory")}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                  <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.createdAt}>{item.time}</time>
                </div>
                <div className="flex shrink-0 gap-1">
                  {item.archived ? (
                    <Button variant="ghost" size="icon-sm" aria-label={t("notifications.recover")} onClick={() => void mutateItem(item.id, "recover")}><RotateCcw className="size-4" aria-hidden="true" /></Button>
                  ) : (
                    <Button variant="ghost" size="icon-sm" aria-label={t("notifications.archive")} onClick={() => void mutateItem(item.id, "archive")}><Archive className="size-4" aria-hidden="true" /></Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {nextCursor ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loading} onClick={() => void load(nextCursor)}>{t("notifications.loadMore")}</Button>
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
