"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
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
  navigationDomains,
  pathMatchesNavigation,
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
}

function SidebarLink({
  item,
  label,
  selected,
  current,
  collapsed,
  isRtl,
  nested = false,
}: SidebarLinkProps) {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "group relative flex items-center rounded-lg text-sm outline-none transition-[background-color,color] duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
        collapsed
          ? nested
            ? "min-h-9 justify-center px-0 py-2"
            : "min-h-10 justify-center px-0 py-2"
          : nested
            ? "min-h-9 gap-2.5 px-3 py-2"
            : "min-h-10 gap-3 px-3 py-2.5",
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
      {!collapsed && (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      )}
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
 * Desktop navigation exposes seller destinations directly. Historical domain
 * relationships still power command/search and route context, but the sidebar no
 * longer hides ordinary pages behind active-domain dropdowns. Only routes marked
 * `sidebarNested` remain visually subordinate because they are genuinely part of
 * their parent workflow.
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
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xs font-bold tracking-tight text-primary">
          SF
        </div>
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
          >
            {navigationDomains.map((domain) => (
              <div key={domain.id} className="space-y-1">
                <SidebarLink
                  item={domain}
                  label={t(domain.labelKey)}
                  selected={pathMatchesNavigation(pathname, domain.href)}
                  current={pathname === domain.href}
                  collapsed={collapsed}
                  isRtl={isRtl}
                />

                {domain.children?.map((child) => (
                  <div
                    key={child.href}
                    className={cn(
                      child.sidebarNested &&
                        !collapsed &&
                        "ms-4 border-s border-sidebar-border ps-2",
                    )}
                  >
                    <SidebarLink
                      item={child}
                      label={t(child.labelKey)}
                      selected={pathMatchesNavigation(pathname, child.href)}
                      current={pathname === child.href}
                      collapsed={collapsed}
                      isRtl={isRtl}
                      nested={child.sidebarNested}
                    />
                  </div>
                ))}
              </div>
            ))}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border p-2.5">
        <TooltipProvider delayDuration={0}>
          <div className="space-y-1">
            {utilityNavigationItems.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                label={t(item.labelKey)}
                selected={pathMatchesNavigation(pathname, item.href)}
                current={pathname === item.href}
                collapsed={collapsed}
                isRtl={isRtl}
              />
            ))}
          </div>
        </TooltipProvider>

        <div className="mt-2 border-t border-sidebar-border pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn(
              "h-10 w-full text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
