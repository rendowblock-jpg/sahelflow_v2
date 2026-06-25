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

export function Sidebar() {
  const pathname = usePathname();
  const { t, dir } = useI18n();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const isRtl = dir === "rtl";

  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  const navContent = (
    <nav className="flex flex-col gap-5">
      {navGroups.map((group) => {
        const groupItems = navItems.filter((item) => item.group === group.id);
        if (groupItems.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col gap-0.5">
            {!collapsed && (
              <span className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
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
                    collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2",
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {/* Active indicator bar — left side in LTR, right in RTL */}
                  {isActive && (
                    <span
                      className={cn(
                        "absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary",
                        isRtl ? "end-0" : "start-0",
                      )}
                    />
                  )}
                  <Icon className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-transform duration-200",
                    isRtl && "icon-rtl-flip",
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
        "flex h-full flex-col border-e border-sidebar-border bg-sidebar transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        collapsed ? "w-[68px]" : "w-64",
      )}
      aria-label="Sidebar navigation"
      dir={dir}
    >
      {/* Logo / brand */}
      <div className={cn(
        "flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-4",
        collapsed && "justify-center px-0",
      )}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-sm ring-1 ring-primary/20">
          <span className="text-sm font-bold text-primary-foreground tracking-tight">SF</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-semibold text-[15px] tracking-tight text-sidebar-foreground leading-none">SahelFlow</span>
            <span className="text-[11px] text-muted-foreground/60 mt-0.5">COD Management</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
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
            collapsed ? "justify-center" : "justify-start",
          )}
          aria-label={t("nav.collapse")}
        >
          <CollapseIcon className={cn("h-4 w-4", isRtl && "icon-rtl-flip")} />
          {!collapsed && <span className="ms-2.5 text-[13px]">{t("nav.collapse")}</span>}
        </Button>
      </div>
    </aside>
  );
}
