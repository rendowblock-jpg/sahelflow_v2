"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { SahelFlowMark } from "@/components/brand/sahelflow-mark";
import { useI18n } from "@/hooks/use-i18n";
import { useInboxUnread } from "@/hooks/use-inbox-unread";
import { useNewMessageAlerts } from "@/hooks/use-new-message-alerts";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";
import {
  navigationItemForPathname,
  sellerSidebarNavigationItems,
  utilityNavigationItems,
  type NavigationItem,
} from "./navigation";

interface SidebarProps {
  serverLocale: Locale;
  serverDir: "ltr" | "rtl";
}

interface SidebarLinkProps {
  item: NavigationItem;
  label: string;
  selected: boolean;
  current: boolean;
  collapsed: boolean;
  isRtl: boolean;
  nested?: boolean;
  /** Live unread count for items flagged `unreadBadge` in the registry. */
  unreadCount?: number;
  /** Localized "Unread messages: n" label for assistive technology. */
  unreadLabel?: string;
}

function SidebarLink({
  item,
  label,
  selected,
  current,
  collapsed,
  isRtl,
  nested = false,
  unreadCount,
  unreadLabel,
}: SidebarLinkProps) {
  const Icon = item.icon;
  const showUnreadBadge = unreadCount !== undefined && unreadCount > 0;
  const unreadBadge = showUnreadBadge ? (
    <span
      // Rail mode has no visible label, so the badge carries the destination
      // name too — the accessible link name stays "Inbox, Unread messages: 5".
      aria-label={
        collapsed && unreadLabel ? `${label} — ${unreadLabel}` : unreadLabel
      }
      data-inbox-unread-badge="true"
      className={
        collapsed
          ? // Rail mode: compact corner bubble on the icon (logical corner
            // flips with RTL).
            "absolute end-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-bold leading-4 tabular-nums text-primary-foreground"
          : "inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold leading-5 tabular-nums text-primary-foreground"
      }
    >
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  ) : null;

  const link = (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "group relative flex min-h-(--control-height) items-center rounded-lg text-sm outline-none transition-[background-color,color] duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
        collapsed
          ? "justify-center px-0 py-2"
          : nested
            ? "gap-2.5 px-3 py-2"
            : "gap-3 px-3 py-2.5",
        selected
          ? nested
            ? "bg-sidebar-accent/75 font-medium text-sidebar-accent-foreground"
            : "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      {!nested && selected && (
        <span
          className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
      <Icon
        className={cn(
          "shrink-0",
          nested ? "size-4" : "size-[18px]",
          selected
            ? "text-foreground"
            : "text-muted-foreground group-hover:text-foreground",
        )}
        aria-hidden="true"
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {unreadBadge}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side={isRtl ? "left" : "right"} sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Stable seller-first desktop navigation. SahelFlow owns the hierarchy so daily
 * destinations stay where sellers build muscle memory; the Settings appearance
 * screen no longer acts as an information-architecture editor. Genuine child
 * jobs remain visually subordinate, while every normal workspace is one click
 * away and Profile lives inside Settings rather than occupying a fixed rail slot.
 */
export function Sidebar({
  serverLocale: _serverLocale,
  serverDir,
}: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const isRtl = serverDir === "rtl";
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const activeHref = navigationItemForPathname(pathname)?.href ?? null;

  // Inbox liveness (R4-a): the sidebar is the persistent shell surface, so it
  // owns the shared unread-summary poll (15s, focus-revalidated, paused while
  // hidden) and the global new-message toast/sound. Both hooks share one SWR
  // key — a single network cadence feeds the badge and the alerts.
  const { total: inboxUnreadTotal } = useInboxUnread();
  useNewMessageAlerts();
  const inboxUnreadLabel = t("inbox.liveness.unreadMessages", {
    count: inboxUnreadTotal,
  });

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "w-[68px]" : "w-[260px]",
      )}
      aria-label={t("nav.sidebarLabel")}
      dir={isRtl ? "rtl" : "ltr"}
      data-navigation-density={collapsed ? "rail" : "expanded"}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-3.5",
          collapsed && "justify-center px-0",
        )}
      >
        <SahelFlowMark
          className="size-9 shrink-0 rounded-lg shadow-sm ring-1 ring-white/8"
          accessibleTitle={collapsed ? "SahelFlow" : undefined}
        />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-none text-sidebar-foreground">
              SahelFlow
            </div>
            <div className="mt-1.5 truncate text-xs text-muted-foreground">
              {t("nav.subtitle")}
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <TooltipProvider delayDuration={0}>
          <nav
            className="flex flex-col gap-1 px-2.5 py-3"
            aria-label={t("nav.sidebarLabel")}
            data-seller-navigation="fixed-priority"
          >
            {sellerSidebarNavigationItems.map((item) => {
              const selected = activeHref === item.href;
              return (
                <div
                  key={item.href}
                  className={cn(
                    item.sidebarNested &&
                      !collapsed &&
                      "ms-4 border-s border-sidebar-border ps-2",
                  )}
                >
                  <SidebarLink
                    item={item}
                    label={t(item.labelKey)}
                    selected={selected}
                    current={selected}
                    collapsed={collapsed}
                    isRtl={isRtl}
                    nested={item.sidebarNested}
                    unreadCount={item.unreadBadge ? inboxUnreadTotal : undefined}
                    unreadLabel={
                      item.unreadBadge ? inboxUnreadLabel : undefined
                    }
                  />
                </div>
              );
            })}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border p-2.5">
        <TooltipProvider delayDuration={0}>
          <div className="space-y-1">
            {utilityNavigationItems.map((item) => {
              const selected = activeHref === item.href;
              return (
                <SidebarLink
                  key={item.href}
                  item={item}
                  label={t(item.labelKey)}
                  selected={selected}
                  current={selected}
                  collapsed={collapsed}
                  isRtl={isRtl}
                  unreadCount={item.unreadBadge ? inboxUnreadTotal : undefined}
                  unreadLabel={
                    item.unreadBadge ? inboxUnreadLabel : undefined
                  }
                />
              );
            })}
          </div>
        </TooltipProvider>

        <div className="mt-2 border-t border-sidebar-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn(
              "min-h-(--control-height) w-full text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed ? "justify-center px-0" : "justify-start px-3",
            )}
            aria-label={t("nav.collapse")}
            aria-pressed={collapsed}
          >
            <CollapseIcon
              className={cn("size-4", isRtl && "icon-rtl-flip")}
              aria-hidden="true"
            />
            {!collapsed && (
              <span className="ms-2 text-sm">{t("nav.collapse")}</span>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
