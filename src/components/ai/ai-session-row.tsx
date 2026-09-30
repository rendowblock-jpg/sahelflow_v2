"use client";

import { Check, Loader2, MoreHorizontal, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import {
  getAiDecisionCopy,
  type AiDecisionLocale,
} from "@/lib/i18n/ai-decision-workspace";
import { cn, DZ_CLOCK, intlLocale } from "@/lib/utils";

/**
 * Relative stamp for a rail row. Today and yesterday keep the clock (the
 * group label owns the day); anything older shows a short date — a bare
 * HH:mm on an old row would lie about when it happened.
 */
export function sessionStamp(value: string, locale: AiDecisionLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  // `en-DZ` resolved English to a US 12-hour clock; the canonical map
  // resolves it to `en-GB`, and DZ_CLOCK pins 24-hour for every language.
  const tag = intlLocale(locale);
  if (date >= startYesterday) {
    return new Intl.DateTimeFormat(tag, {
      hour: "2-digit",
      minute: "2-digit",
      ...DZ_CLOCK,
    }).format(date);
  }
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(
    date,
  );
}

export interface AiSessionRowModel {
  id: string;
  title: string;
  /** Last activity (clock for today/yesterday, a date for older). */
  stamp: string;
  pinned: boolean;
  active: boolean;
  reviewCount: number;
}

/** Inline rename: Enter saves, Escape cancels, the field keeps its own direction. */
export function AiSessionRenameRow({
  value,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      data-ai-session-rename="true"
      className="flex items-center gap-1 rounded-control border border-primary/30 bg-card px-1 py-0.5"
    >
      <Input
        value={value}
        autoFocus
        dir="auto"
        maxLength={160}
        aria-label={t("ai.history.rename")}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        className="h-8 border-0 bg-transparent px-1.5 text-body-sm shadow-none focus-visible:ring-0"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label={t("ai.history.renameSave")}
        disabled={!value.trim() || saving}
        onClick={onSave}
      >
        {saving ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-3.5" aria-hidden="true" />
        )}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        aria-label={t("ai.history.renameCancel")}
        disabled={saving}
        onClick={onCancel}
      >
        <X className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * One conversation in the Agents rail.
 *
 * The row is a single quiet line of identity (title + stamp) over one line of
 * the latest turn. Every management verb lives behind one overflow menu, so
 * the active row no longer wears a cramped toolbar on top of its title. Delete
 * stays two-step: the menu arms it and the row itself asks for the second,
 * explicit confirmation — an armed row disarms on its own after a pause.
 */
export function AiSessionRow({
  session,
  locale,
  navigationLocked,
  actionsLocked,
  busy,
  deleteArmed,
  onOpen,
  onRename,
  onTogglePin,
  onArmDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  session: AiSessionRowModel;
  locale: AiDecisionLocale;
  navigationLocked: boolean;
  actionsLocked: boolean;
  busy: boolean;
  deleteArmed: boolean;
  onOpen: () => void;
  onRename: () => void;
  onTogglePin: () => void;
  onArmDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="group/session relative">
      <button
        type="button"
        data-ai-session={session.id}
        data-ai-session-pinned={session.pinned ? "true" : undefined}
        aria-current={session.active ? "page" : undefined}
        disabled={navigationLocked}
        onClick={onOpen}
        title={session.stamp ? `${session.title} · ${session.stamp}` : session.title}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-control px-2.5 text-start outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          session.active
            ? "bg-accent text-accent-foreground"
            : "text-foreground/85 hover:bg-muted/70 hover:text-foreground",
          deleteArmed && "bg-destructive-subtle",
        )}
      >
        {/* Seller-named titles keep their own direction so a Latin title
            truncates at its own end while the row aligns with the rail. */}
        <span
          dir="auto"
          data-sf-seller-label="true"
          className={cn(
            "min-w-0 flex-1 truncate text-body-sm",
            session.active ? "font-medium" : "font-normal",
            "group-hover/session:pe-6 group-focus-within/session:pe-6 max-md:pe-6",
          )}
        >
          {session.title}
        </span>
        {session.reviewCount > 0 ? (
          <span className="shrink-0 rounded-full bg-warning-soft px-1.5 text-caption font-semibold tabular-nums text-warning group-hover/session:hidden">
            <span className="sr-only">
              {`${getAiDecisionCopy(locale, "needsReview")}: `}
            </span>
            {session.reviewCount}
          </span>
        ) : null}
      </button>

      {deleteArmed ? (
        <div className="mt-1 flex items-center gap-1.5 px-1 pb-1">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-7 flex-1 text-caption"
            data-ai-session-delete={session.id}
            aria-label={t("ai.history.deleteConfirm")}
            disabled={actionsLocked}
            onClick={onConfirmDelete}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {t("ai.history.deleteConfirm")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-caption"
            onClick={onCancelDelete}
          >
            {t("ai.history.renameCancel")}
          </Button>
        </div>
      ) : null}

      {!busy && !deleteArmed ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={getAiDecisionCopy(locale, "sessionActions")}
              disabled={actionsLocked}
              className={cn(
                "absolute end-1 top-1 size-7 text-muted-foreground hover:text-foreground",
                "opacity-0 group-hover/session:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100",
                "max-md:opacity-100",
              )}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="size-4" aria-hidden="true" />
              {t("ai.history.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onTogglePin}>
              {session.pinned ? (
                <PinOff className="size-4" aria-hidden="true" />
              ) : (
                <Pin className="size-4" aria-hidden="true" />
              )}
              {getAiDecisionCopy(
                locale,
                session.pinned ? "unpinSession" : "pinSession",
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onArmDelete}>
              <Trash2 className="size-4" aria-hidden="true" />
              {t("ai.history.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
