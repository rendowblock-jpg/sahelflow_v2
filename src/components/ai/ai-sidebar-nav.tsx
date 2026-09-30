"use client";

import Link from "next/link";
import {
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type RefObject,
} from "react";
import { PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";

import { SahelFlowMark } from "@/components/brand/sahelflow-mark";

import type { AiSetupState } from "@/components/ai/ai-workspace-types";

import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

/**
 * Building blocks of the Agents sidebar: the date grouping of conversations,
 * the search text, the platform modifier label and the rail button that
 * renders every destination expanded (icon + label) or collapsed (icon).
 */
export type SessionGroup = "pinned" | "today" | "yesterday" | "week" | "earlier";

export const GROUP_ORDER: readonly SessionGroup[] = [
  "pinned",
  "today",
  "yesterday",
  "week",
  "earlier",
];

export function sessionDateGroup(value: string): Exclude<SessionGroup, "pinned"> {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "earlier";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 7);
  if (date >= startToday) return "today";
  if (date >= startYesterday) return "yesterday";
  if (date >= startWeek) return "week";
  return "earlier";
}

export function groupLabel(
  group: SessionGroup,
  workspace: ReturnType<typeof useAiWorkspace>,
): string {
  switch (group) {
    case "pinned":
      return getAiDecisionCopy(workspace.locale, "pinnedGroup");
    case "today":
      return workspace.copy("today");
    case "yesterday":
      return workspace.copy("yesterday");
    case "week":
      return getAiDecisionCopy(workspace.locale, "lastWeek");
    default:
      return getAiDecisionCopy(workspace.locale, "earlier");
  }
}

export function sessionSearchText(session: {
  title: string | null;
  messages?: Array<{ content?: string | null } | null> | null;
}): string {
  const latest = (session.messages ?? [])
    .map((message) => message?.content ?? "")
    .join(" ");
  return `${session.title ?? ""} ${latest}`.toLowerCase();
}

const noopSubscribe = () => () => undefined;

/** Platform-true modifier label for the shortcut hints (server: "Ctrl"). */
export function useModifierLabel(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

export function RailButton({
  icon: Icon,
  label,
  hint,
  badge,
  count,
  active,
  collapsed,
  disabled,
  onClick,
  dataAttr,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  hint?: string;
  badge?: number;
  /** Neutral count (e.g. active connections) — never an alert. */
  count?: number;
  active?: boolean;
  collapsed: boolean;
  disabled?: boolean;
  onClick: () => void;
  dataAttr?: Record<string, string>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      {...dataAttr}
      className={cn(
        "group/rail relative flex h-9 w-full items-center gap-2.5 rounded-control text-body-sm font-medium outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        collapsed ? "justify-center px-0" : "px-2.5",
        active
          ? "bg-accent text-accent-foreground"
          : "text-foreground/85 hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden={true} />
      {!collapsed ? <span className="min-w-0 flex-1 truncate text-start">{label}</span> : null}
      {!collapsed && hint ? (
        <kbd
          dir="ltr"
          className="hidden shrink-0 font-sans text-caption text-muted-foreground opacity-0 transition-opacity group-hover/rail:opacity-100 lg:inline"
        >
          {hint}
        </kbd>
      ) : null}
      {!collapsed && !badge && count && count > 0 ? (
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-caption font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
      {badge && badge > 0 ? (
        collapsed ? (
          <span
            aria-hidden="true"
            className="absolute end-1.5 top-1.5 size-2 rounded-full bg-warning ring-2 ring-sidebar"
          />
        ) : (
          <span className="shrink-0 rounded-full bg-warning-soft px-1.5 text-caption font-semibold tabular-nums text-warning">
            {badge}
          </span>
        )
      ) : null}
    </button>
  );
}

/** The sidebar's inline chat search: Escape or the close control clears it. */
export function AiSidebarSearch({
  inputRef,
  value,
  placeholder,
  closeLabel,
  onChange,
  onClose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  placeholder: string;
  closeLabel: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        data-ai-history-search="true"
        className="h-9 w-full rounded-control border border-border bg-card ps-8 pe-8 text-body-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={onClose}
        className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The sidebar footer's provider line (AI-26): configuration truth from the
 * setup probe — consent + key — never a provider heartbeat. While setup is
 * unresolved the dot is neutral and nothing is claimed.
 */
export function AiSidebarStatus({
  collapsed,
  setup,
  statusLabel,
  setupLabel,
}: {
  collapsed: boolean;
  setup: AiSetupState | null;
  statusLabel: string;
  setupLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 border-t border-sidebar-border",
        collapsed ? "justify-center px-2" : "px-3.5",
      )}
    >
      <span
        data-ai-status-dot={!setup ? undefined : setup.ready ? "ready" : "attention"}
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", !setup && "bg-muted-foreground")}
        title={statusLabel}
      />
      {!collapsed ? (
        <>
          <p className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
            <span className="font-medium text-foreground">Gemini</span>
            {setup && !setup.ready ? null : (
              <>
                {" · "}
                {statusLabel}
              </>
            )}
          </p>
          {setup && !setup.ready ? (
            <Link
              href="/settings?group=intelligence"
              className="shrink-0 rounded-control px-1.5 py-0.5 text-caption font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {setupLabel}
            </Link>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Identity and the collapse control; collapsed, only the control remains. */
export function AiSidebarHeader({
  collapsed,
  title,
  toggleLabel,
  shortcut,
  onToggle,
  children,
}: {
  collapsed: boolean;
  title: string;
  toggleLabel: string;
  shortcut: string;
  onToggle?: () => void;
  /** A leading control supplied by the layout (mobile). */
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-14 shrink-0 items-center gap-2",
        collapsed ? "justify-center px-2" : "px-3",
      )}
    >
      {children}
      {!collapsed ? (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <SahelFlowMark data-ai-agent-mark="true" className="size-7 shrink-0" />
          <h2 className="truncate text-body-sm font-semibold">{title}</h2>
        </div>
      ) : null}
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          data-ai-rail-toggle="true"
          aria-label={toggleLabel}
          title={`${toggleLabel} (${shortcut})`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}
