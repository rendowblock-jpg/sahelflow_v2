"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { useUIStore } from "@/stores/ui-store";
import { navItems, navGroups } from "./navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const pathname = usePathname();
  const { t, dir } = useI18n();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  // Chevron direction respects RTL
  const CollapseIcon = collapsed
    ? (dir === "rtl" ? ChevronRight : ChevronLeft)
    : (dir === "rtl" ? ChevronLeft : ChevronRight);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
      aria-label="Sidebar navigation"
    >
      {/* Logo / brand */}
      <div className="flex h-16 items-center gap-2 border-b px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
          SF
        </div>
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight">SahelFlow</span>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-4 p-2">
          {navGroups.map((group) => {
            const groupItems = navItems.filter((item) => item.group === group.id);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.id} className="flex flex-col gap-1">
                {!collapsed && (
                  <span className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t(group.labelKey)}
                  </span>
                )}
                {collapsed && <Separator className="my-1" />}
                {groupItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? t(item.labelKey) : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive && "bg-accent text-accent-foreground",
                        collapsed && "justify-center px-2",
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      {!collapsed && <span>{t(item.labelKey)}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Collapse toggle */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className={cn("w-full", collapsed ? "justify-center" : "justify-start")}
          aria-label={t("nav.collapse")}
        >
          <CollapseIcon className="h-4 w-4" />
          {!collapsed && <span className="ml-2">{t("nav.collapse")}</span>}
        </Button>
      </div>
    </aside>
  );
}
