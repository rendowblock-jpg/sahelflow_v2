"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { useUIStore } from "@/stores/ui-store";
import { navItems, navGroups } from "./navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Locale } from "@/lib/i18n";

interface SidebarProps {
  /** Server-rendered locale (from cookie) — used for initial render */
  serverLocale: Locale;
  /** Server-rendered direction (from cookie) — used for initial render */
  serverDir: "ltr" | "rtl";
}

export function Sidebar({ serverLocale: _serverLocale, serverDir }: SidebarProps) {
  const pathname = usePathname();
  // useI18n() for translations. The hook now uses ServerLocaleContext for the
  // initial render (hydration-safe) + the store locale after mount.
  const { t } = useI18n();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  // Use the server-rendered dir ONLY — it comes from the cookie (via the server
  // layout) and matches on both server + client (no hydration mismatch).
  // Live locale switching is handled by router.refresh() in the Topbar.
  const isRtl = serverDir === "rtl";

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  const navContent = (
    <nav className="flex flex-col gap-6">
      {navGroups.map((group) => {
        const groupItems = navItems.filter((item) => item.group === group.id);
        if (groupItems.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col gap-1">
            {!collapsed && (
              <span className={cn(
                "px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60",
                isRtl ? "text-end" : "text-start",
              )}>
                {t(group.labelKey)}
              </span>
            )}
            {groupItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              const linkContent = (
                <Link
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg text-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
                    // In RTL, flex-row + dir="rtl" naturally puts icon on the right
                    collapsed ? "justify-center px-0 py-2" : "px-3 py-2",
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {/* Active indicator bar — explicit physical positioning.
                      LTR: left edge (next to the icon on the left).
                      RTL: right edge (next to the icon on the right). */}
                  {isActive && (
                    <span
                      className={cn(
                        "absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary",
                        isRtl ? "right-0" : "left-0",
                      )}
                    />
                  )}
                  <Icon className={cn(
                    "h-5 w-5 shrink-0 transition-transform duration-200",
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )} />
                  {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                </Link>
              );

              // When collapsed, wrap in tooltip for label
              if (collapsed) {
                return (
                  <Tooltip key={item.href} delayDuration={0}>
                    <TooltipTrigger asChild>
                      {linkContent}
                    </TooltipTrigger>
                    <TooltipContent side={isRtl ? "left" : "right"} sideOffset={8}>
                      {t(item.labelKey)}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return <div key={item.href}>{linkContent}</div>;
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        // Explicit physical border: LTR = border-right (sidebar on left),
        // RTL = border-left (sidebar on right). Don't rely on border-e.
        "border-e border-sidebar-border",
        collapsed ? "w-[68px]" : "w-64",
      )}
      aria-label={t("nav.sidebarLabel")}
      dir={isRtl ? "rtl" : "ltr"}
    >
      {/* Logo / brand */}
      <div className={cn(
        "flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4",
        collapsed && "justify-center px-0",
        // In RTL, reverse the logo layout (icon on right, text on left)
              )}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-sm ring-1 ring-primary/20">
          <span className="text-sm font-bold text-primary-foreground tracking-tight">SF</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-semibold text-base tracking-tight text-sidebar-foreground leading-none">SahelFlow</span>
            <span className="text-xs text-muted-foreground/60 mt-1">{t('nav.subtitle')}</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="min-h-0 flex-1 px-3 py-4">
        {collapsed ? (
          <TooltipProvider delayDuration={0}>
            {navContent}
          </TooltipProvider>
        ) : (
          navContent
        )}
      </ScrollArea>

      {/* Collapse toggle — footer */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className={cn(
            "w-full text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60",
            collapsed ? "justify-center" : isRtl ? "justify-end" : "justify-start",
          )}
          aria-label={t("nav.collapse")}
        >
          <CollapseIcon className={cn("h-4 w-4", isRtl && "icon-rtl-flip")} />
          {!collapsed && <span className={cn("text-sm", isRtl ? "me-3" : "ms-3")}>{t("nav.collapse")}</span>}
        </Button>
      </div>
    </aside>
  );
}
