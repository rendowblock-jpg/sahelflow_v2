"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { useUIStore } from "@/stores/ui-store";
import { navItems, navGroups } from "./navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const pathname = usePathname();
  const { t, dir } = useI18n();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const isRtl = dir === "rtl";

  const CollapseIcon = collapsed
    ? (isRtl ? ChevronRight : ChevronLeft)
    : (isRtl ? ChevronLeft : ChevronRight);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-60",
      )}
      aria-label="Sidebar navigation"
      dir={dir}
    >
      {/* Logo / brand */}
      <div className={cn("flex h-14 items-center gap-2.5 border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-sm">
          <span className="text-sm font-bold text-primary-foreground tracking-tight">SF</span>
        </div>
        {!collapsed && (
          <span className="font-semibold text-base tracking-tight">SahelFlow</span>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-4">
          {navGroups.map((group) => {
            const groupItems = navItems.filter((item) => item.group === group.id);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.id} className="flex flex-col gap-0.5">
                {!collapsed && (
                  <span className="px-3 pb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider text-[10px] font-semibold">
                    {t(group.labelKey)}
                  </span>
                )}
                {groupItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? t(item.labelKey) : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150",
                        collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Collapse toggle */}
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className={cn("w-full text-muted-foreground hover:text-foreground", collapsed ? "justify-center" : "justify-start")}
          aria-label={t("nav.collapse")}
        >
          <CollapseIcon className="h-4 w-4" />
          {!collapsed && <span className="ml-2">{t("nav.collapse")}</span>}
        </Button>
      </div>
    </aside>
  );
}
