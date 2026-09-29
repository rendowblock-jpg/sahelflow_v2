"use client";

import Link from "next/link";
import { Archive, Check, RotateCcw, X } from "lucide-react";

import {
  getNotificationPresentation,
  type NotificationDayGroup,
} from "@/components/notifications/notification-taxonomy";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import type { NotificationCenterItem } from "@/hooks/use-notification-center";
import { cn } from "@/lib/utils";

export type NotificationItemAction = "read" | "archive" | "recover";

interface NotificationFeedListProps {
  groups: NotificationDayGroup[];
  busy: boolean;
  onAction: (id: string, action: NotificationItemAction) => void;
  /** Remove a computed (non-stored) alert from the center, with Undo. */
  onDismiss?: (item: NotificationCenterItem) => void;
}

/**
 * The Notification Center feed: day-grouped, one row per notification.
 *
 * The whole row is the target (stretched link), so a seller can click anywhere
 * on it instead of hunting for the title. Row actions sit above the stretched
 * link and reveal on hover or keyboard focus, so a resting list reads as a
 * clean column of messages rather than a wall of icon buttons.
 */
export function NotificationFeedList({
  groups,
  busy,
  onAction,
  onDismiss,
}: NotificationFeedListProps) {
  const { t } = useI18n();

  return (
    <section
      className="overflow-clip rounded-surface border border-border bg-card"
      aria-busy={busy}
      aria-label={t("notifications.title")}
    >
      {groups.map((group, index) => (
        <div key={group.key} data-day-group={group.key}>
          <h3
            className={cn(
              "sticky top-0 z-20 bg-card/95 px-4 py-2 text-caption font-medium text-muted-foreground backdrop-blur-sm",
              index > 0 && "border-t border-border/70",
            )}
          >
            {group.label}
          </h3>
          <ul className="divide-y divide-border/60">
            {group.items.map((item) => (
              <NotificationFeedRow
                key={item.id}
                item={item}
                onAction={onAction}
                onDismiss={onDismiss}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function NotificationFeedRow({
  item,
  onAction,
  onDismiss,
}: {
  item: NotificationCenterItem;
  onAction: (id: string, action: NotificationItemAction) => void;
  onDismiss?: (item: NotificationCenterItem) => void;
}) {
  const { t } = useI18n();
  const presentation = getNotificationPresentation(item);
  const Icon = presentation.icon;
  const unread = !item.read;

  return (
    <li
      className="group relative flex items-start gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-muted/40 focus-within:bg-muted/40 motion-reduce:transition-none"
      data-unread={unread ? "true" : undefined}
    >
      {unread ? (
        <span
          className="absolute inset-y-3 start-0 w-0.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      ) : null}

      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-surface",
          presentation.className,
        )}
        role="img"
        aria-label={t(presentation.labelKey)}
        title={t(presentation.labelKey)}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <Link
            href={item.link}
            className={cn(
              "min-w-0 flex-1 truncate text-body text-foreground outline-none",
              "after:absolute after:inset-0 after:rounded-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
              unread ? "font-semibold" : "font-medium",
            )}
            onClick={() => {
              if (item.durable && unread) onAction(item.id, "read");
            }}
          >
            {unread ? (
              <span className="sr-only">{t("notifications.unread")}: </span>
            ) : null}
            {item.title}
          </Link>
          <time
            className="shrink-0 text-caption tabular-nums text-muted-foreground transition-opacity duration-150 group-focus-within:opacity-0 group-hover:opacity-0 motion-reduce:transition-none"
            dateTime={item.createdAt}
          >
            {item.time}
          </time>
        </div>
        {item.body ? (
          <p className="mt-0.5 line-clamp-2 text-body-sm text-muted-foreground">
            {item.body}
          </p>
        ) : null}
      </div>

      {item.durable ? (
        <div className="absolute end-3 top-2.5 z-10 flex gap-0.5 rounded-control bg-card/95 p-0.5 opacity-0 shadow-sm ring-1 ring-border transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
          {unread ? (
            <RowAction
              label={t("notifications.markRead")}
              icon={Check}
              onClick={() => onAction(item.id, "read")}
            />
          ) : null}
          {item.archived ? (
            <RowAction
              label={t("notifications.recover")}
              icon={RotateCcw}
              onClick={() => onAction(item.id, "recover")}
            />
          ) : (
            <RowAction
              label={t("notifications.archive")}
              icon={Archive}
              onClick={() => onAction(item.id, "archive")}
            />
          )}
        </div>
      ) : onDismiss ? (
        <div className="absolute end-3 top-2.5 z-10 flex gap-0.5 rounded-control bg-card/95 p-0.5 opacity-0 shadow-sm ring-1 ring-border transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
          <RowAction
            label={t("notifications.dismiss")}
            icon={X}
            onClick={() => onDismiss(item)}
          />
        </div>
      ) : null}
    </li>
  );
}

function RowAction({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Archive;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
        >
          <Icon className="size-4" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
