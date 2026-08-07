"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

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
  navigationDomainForPathname,
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
  active: boolean;
  collapsed: boolean;
  isRtl: boolean;
  nested?: boolean;
}

function SidebarLink({
  item,
  active,
  collapsed,
  isRtl,
  nested = false,
}: SidebarLinkProps) {
  const { t } = useI18n();
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-9 items-center rounded-md text-sm outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
        nested
          ? "gap-2 px-2.5 py-1.5 text-[13px]"
          : collapsed
            ? "justify-center px-0 py-2"
            : "gap-3 px-3 py-2",
        active
          ? nested
            ? "bg-sidebar-accent/70 font-medium text-sidebar-accent-foreground"
            : "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      {!nested && active && (
        <span
          className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
      <Icon
        className={cn(
          "shrink-0",
          nested ? "size-3.5" : "size-[18px]",
          active
            ? "text-foreground"
            : "text-muted-foreground group-hover:text-foreground",
        )}
        aria-hidden="true"
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side={isRtl ? "left" : "right"} sideOffset={8}>
        {t(item.labelKey)}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Phase 5 desktop navigation.
 *
 * The sidebar exposes seven durable business domains. Secondary destinations are
 * revealed only inside the active domain, so sellers navigate by job/context
 * instead of scanning a long module inventory. Profile/settings stay in the
 * utility footer and do not compete with daily work.
 */
export function Sidebar({ serverLocale: _serverLocale, serverDir }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const isRtl = serverDir === "rtl";
  const activeDomain = navigationDomainForPathname(pathname);
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar",
        "transition-[width] duration-200 ease-out motion-reduce:transition-none",
        collapsed ? "w-16" : "w-[248px]",
      )}
      aria-label={t("nav.sidebarLabel")}
      dir={isRtl ? "rtl" : "ltr"}
      data-navigation-density={collapsed ? "rail" : "expanded"}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-3 border-b border-sidebar-border px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-[11px] font-bold tracking-tight text-primary">
          SF
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-none text-sidebar-foreground">
              SahelFlow
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {t("nav.subtitle")}
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <TooltipProvider delayDuration={0}>
          <nav className="flex flex-col gap-1 px-2 py-3" aria-label={t("nav.groupOperations")}>
            {navigationDomains.map((domain) => {
              const domainActive = activeDomain?.id === domain.id;
              const DomainIcon = domain.icon;

              return (
                <div key={domain.id} className="space-y-1">
                  <div className="relative">
                    <SidebarLink
                      item={domain}
                      active={domainActive && pathname === domain.href}
                      collapsed={collapsed}
                      isRtl={isRtl}
                    />
                    {!collapsed && domain.children?.length ? (
                      <ChevronRight
                        className={cn(
                          "pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
                          domainActive && "rotate-90",
                          isRtl && !domainActive && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    ) : null}
                    {collapsed && domainActive ? (
                      <span
                        className="pointer-events-none absolute inset-y-2 start-0 w-0.5 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    ) : null}
                    {collapsed && domainActive ? (
                      <DomainIcon className="sr-only" aria-hidden="true" />
                    ) : null}
                  </div>

                  {!collapsed && domainActive && domain.children?.length ? (
                    <div className="ms-4 space-y-0.5 border-s border-sidebar-border ps-2">
                      {domain.children.map((child) => (
                        <SidebarLink
                          key={child.href}
                          item={child}
                          active={pathMatchesNavigation(pathname, child.href)}
                          collapsed={false}
                          isRtl={isRtl}
                          nested
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>
        </TooltipProvider>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <TooltipProvider delayDuration={0}>
          <div className="space-y-1">
            {utilityNavigationItems.map((item) => (
              <SidebarLink
                key={item.href}
                item={item}
                active={pathMatchesNavigation(pathname, item.href)}
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
              "h-9 w-full text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed ? "justify-center px-0" : "justify-start px-3",
            )}
            aria-label={t("nav.collapse")}
            aria-pressed={collapsed}
          >
            <CollapseIcon
              className={cn("size-4", isRtl && "icon-rtl-flip")}
              aria-hidden="true"
            />
            {!collapsed && <span className="ms-2 text-sm">{t("nav.collapse")}</span>}
          </Button>
        </div>
      </div>
    </aside>
  );
}
