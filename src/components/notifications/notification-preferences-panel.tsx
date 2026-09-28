"use client";

import { useId } from "react";
import { History } from "lucide-react";

import { Row, RowGroup } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import type { NotificationCenterPreference } from "@/hooks/use-notification-center";
import type { Locale } from "@/lib/i18n";
import { DZ_CLOCK, cn, intlLocale } from "@/lib/utils";

/** Default quiet window offered by the one-tap toggle: 22:00 → 08:00. */
const DEFAULT_QUIET_START = 1320;
const DEFAULT_QUIET_END = 480;
const PAUSE_MS = 60 * 60_000;

/** Local 24h clock label for a minute-of-day preference (PII-free). */
function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Localized time-of-day label for a mute deadline (PII-free). */
function formatDeadline(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    ...DZ_CLOCK,
  }).format(new Date(iso));
}

interface NotificationPreferencesPanelProps {
  preference: NotificationCenterPreference | null;
  onChange: (patch: Record<string, unknown>) => void;
  className?: string;
}

/**
 * Delivery preferences for the Notification Center.
 *
 * Rendered as one quiet settings column beside the feed (below it on narrow
 * widths) instead of a toolbar of chips above it: the feed is the work, the
 * preferences are occasional configuration.
 */
export function NotificationPreferencesPanel({
  preference,
  onChange,
  className,
}: NotificationPreferencesPanelProps) {
  const { t, locale } = useI18n();
  const baseId = useId();

  const channels = preference
    ? ([
        {
          key: "inboxEnabled",
          label: t("notifications.inboxCategory"),
          description: t("notifications.inboxCategoryDescription"),
          checked: preference.inboxEnabled,
        },
        {
          key: "nativeEnabled",
          label: t("notifications.nativeDesktop"),
          description: t("notifications.nativeDesktopDescription"),
          checked: preference.nativeEnabled,
        },
        {
          key: "soundEnabled",
          label: t("notifications.sound"),
          description: t("notifications.soundDescription"),
          checked: preference.soundEnabled,
        },
        {
          key: "previewEnabled",
          label: t("notifications.preview"),
          description: t("notifications.previewDescription"),
          checked: preference.previewEnabled,
        },
      ] as const)
    : null;

  const quietEnabled =
    preference?.quietStartMinute !== null &&
    preference?.quietStartMinute !== undefined &&
    preference.quietEndMinute !== null;

  return (
    <aside
      className={cn("min-w-0 space-y-6", className)}
      aria-labelledby={`${baseId}-title`}
    >
      <div className="space-y-1">
        <h2 id={`${baseId}-title`} className="text-title-3 text-foreground">
          {t("notifications.preferences")}
        </h2>
        <p className="text-body-sm text-muted-foreground">
          {t("notifications.preferencesDescription")}
        </p>
      </div>

      {preference && channels ? (
        <>
          <section className="space-y-2" aria-labelledby={`${baseId}-channels`}>
            <h3
              id={`${baseId}-channels`}
              className="text-caption font-medium text-muted-foreground"
            >
              {t("notifications.channelsTitle")}
            </h3>
            <RowGroup>
              {channels.map((channel) => {
                const controlId = `${baseId}-${channel.key}`;
                return (
                  <Row
                    key={channel.key}
                    controlId={controlId}
                    label={channel.label}
                    description={channel.description}
                    className="gap-2 p-3.5 sm:gap-4"
                    control={
                      <Switch
                        id={controlId}
                        checked={channel.checked}
                        aria-describedby={`${controlId}-description`}
                        onCheckedChange={(checked) =>
                          onChange({ [channel.key]: checked })
                        }
                      />
                    }
                  />
                );
              })}
            </RowGroup>
          </section>

          <section className="space-y-2" aria-labelledby={`${baseId}-schedule`}>
            <h3
              id={`${baseId}-schedule`}
              className="text-caption font-medium text-muted-foreground"
            >
              {t("notifications.scheduleTitle")}
            </h3>
            <RowGroup>
              <Row
                controlId={`${baseId}-quiet`}
                label={t("notifications.quietHours")}
                description={
                  quietEnabled
                    ? t("notifications.quietHoursWindow", {
                        start: formatMinute(preference.quietStartMinute ?? 0),
                        end: formatMinute(preference.quietEndMinute ?? 0),
                      })
                    : t("notifications.quietHoursOff")
                }
                className="gap-2 p-3.5 sm:gap-4"
                control={
                  <Switch
                    id={`${baseId}-quiet`}
                    checked={quietEnabled}
                    aria-describedby={`${baseId}-quiet-description`}
                    onCheckedChange={(checked) =>
                      onChange(
                        checked
                          ? {
                              quietStartMinute: DEFAULT_QUIET_START,
                              quietEndMinute: DEFAULT_QUIET_END,
                            }
                          : { quietStartMinute: null, quietEndMinute: null },
                      )
                    }
                  />
                }
              />
              <Row
                label={t("notifications.pauseTitle")}
                description={
                  preference.mutedUntil
                    ? t("notifications.mutedUntil", {
                        time: formatDeadline(preference.mutedUntil, locale),
                      })
                    : t("notifications.pauseDescription")
                }
                className="gap-2 p-3.5 sm:gap-4"
                control={
                  <Button
                    type="button"
                    variant={preference.mutedUntil ? "secondary" : "outline"}
                    size="sm"
                    onClick={() =>
                      onChange({
                        mutedUntil: preference.mutedUntil
                          ? null
                          : new Date(Date.now() + PAUSE_MS).toISOString(),
                      })
                    }
                  >
                    {preference.mutedUntil
                      ? t("notifications.unmute")
                      : t("notifications.muteHour")}
                  </Button>
                }
              />
            </RowGroup>
          </section>

          <p className="flex items-center gap-2 text-caption text-muted-foreground">
            <History className="size-3.5 shrink-0" aria-hidden="true" />
            {t("notifications.retentionNote", { days: preference.retentionDays })}
          </p>
        </>
      ) : (
        <div
          className="space-y-2"
          role="status"
          aria-busy="true"
          aria-label={t("notifications.loading")}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 rounded-surface" />
          ))}
        </div>
      )}
    </aside>
  );
}
