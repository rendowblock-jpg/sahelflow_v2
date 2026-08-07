"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  Bell,
  Check,
  ChevronDown,
  Command,
  Globe,
  HelpCircle,
  LogOut,
  Menu,
  Package,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  User,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { useI18n } from "@/hooks/use-i18n";
import type { Locale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { logoutAndRedirect } from "@/lib/auth/logout-client";
import { useShopStore } from "@/stores/shop-store";
import {
  navigationItemForPathname,
} from "./navigation";
import { Sidebar } from "./sidebar";

const LOCALE_OPTIONS: Array<{ value: Locale; label: string; flag: string }> = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "ar", label: "العربية", flag: "🇩🇿" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

interface TopbarProps {
  onCommandPaletteOpen: () => void;
  serverLocale: Locale;
  serverDir: "ltr" | "rtl";
}

interface Notification {
  id: string;
  type: "order" | "delivery" | "stock" | "info" | "return" | "alert";
  title: string;
  body?: string;
  time: string;
  read: boolean;
  link?: string;
}

const NOTIFICATION_PRESENTATION: Record<
  Notification["type"],
  {
    icon: typeof ShoppingCart;
    className: string;
  }
> = {
  order: {
    icon: ShoppingCart,
    className: "bg-primary/10 text-primary",
  },
  delivery: {
    icon: Truck,
    className: "bg-success/10 text-success",
  },
  stock: {
    icon: Package,
    className: "bg-warning/10 text-warning",
  },
  info: {
    icon: Bell,
    className: "bg-muted text-muted-foreground",
  },
  return: {
    icon: RotateCcw,
    className: "bg-warning/10 text-warning",
  },
  alert: {
    icon: AlertCircle,
    className: "bg-destructive/10 text-destructive",
  },
};

/**
 * Phase 5 application command/title bar.
 *
 * The bar carries only durable workspace context and universal controls: current
 * route context, exact shop switch authority, command/search, notifications and
 * compact user/environment controls. Decorative "live" chrome and page-specific
 * actions stay out of the application frame.
 */
export function Topbar({
  onCommandPaletteOpen,
  serverLocale,
  serverDir,
}: TopbarProps) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const currentNavigation = navigationItemForPathname(pathname);

  const shops = useShopStore((state) => state.shops);
  const activeShopId = useShopStore((state) => state.activeShopId);
  const loaded = useShopStore((state) => state.loaded);
  const switchStatus = useShopStore((state) => state.switchStatus);
  const switchTargetId = useShopStore((state) => state.switchTargetId);
  const switchError = useShopStore((state) => state.switchError);
  const setActiveShop = useShopStore((state) => state.setActiveShop);
  const loadShops = useShopStore((state) => state.loadShops);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications");
      if (!response.ok) return;
      const payload = (await response.json()) as {
        notifications?: Notification[];
      };
      setNotifications(payload.notifications ?? []);
    } catch {
      // Notifications are a projection. Their failure must not block work.
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadNotifications(), 0);
    const interval = window.setInterval(
      () => void loadNotifications(),
      60_000,
    );
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  const unreadCount = notifications.filter((notification) => !notification.read)
    .length;
  const activeShop = shops.find((shop) => shop.id === activeShopId) ?? null;
  const switchTarget =
    shops.find((shop) => shop.id === switchTargetId) ?? null;
  const isRtl = serverDir === "rtl";

  const handleShopSwitch = useCallback(
    async (shopId: string) => {
      try {
        await setActiveShop(shopId);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("topbar.shopSwitchBlocked"),
        );
      }
    },
    [setActiveShop, t],
  );

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutAndRedirect({
        onFailure: () => toast.error(t("topbar.logoutFailed")),
      });
    } finally {
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, t]);

  const shopLabel =
    switchStatus === "pending"
      ? t("topbar.shopSwitchPending", { shop: switchTarget?.name ?? "" })
      : switchStatus === "blocked"
        ? t("topbar.shopSwitchBlocked", { shop: switchTarget?.name ?? "" })
        : loaded
          ? (activeShop?.name ?? t("topbar.selectShop"))
          : t("topbar.loading");

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2.5 sm:px-3 lg:h-12 lg:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.openMenu")}
              >
                <Menu className="size-4" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={isRtl ? "right" : "left"}
              className="w-[min(290px,88vw)] p-0"
            >
              <Sidebar serverLocale={serverLocale} serverDir={serverDir} />
            </SheetContent>
          </Sheet>
        </div>

        {currentNavigation ? (
          <div className="hidden max-w-40 truncate text-sm font-medium text-foreground lg:block">
            {t(currentNavigation.labelKey)}
          </div>
        ) : null}

        {currentNavigation ? (
          <div className="hidden h-5 w-px bg-border lg:block" aria-hidden="true" />
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 max-w-56 justify-start gap-2 px-2 font-medium"
              aria-live="polite"
              title={
                switchStatus === "blocked" ? (switchError ?? undefined) : undefined
              }
            >
              <Store
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="truncate text-start">{shopLabel}</span>
              <ChevronDown
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 shadow-dropdown">
            <DropdownMenuLabel>{t("nav.groupWorkspace")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {shops.map((shop) => (
              <DropdownMenuItem
                key={shop.id}
                onClick={() => void handleShopSwitch(shop.id)}
                disabled={
                  switchStatus === "pending" || shop.id === activeShopId
                }
                className="gap-2"
              >
                <span className="text-base" aria-hidden="true">
                  {shop.icon ?? "🏪"}
                </span>
                <span className="min-w-0 flex-1 truncate">{shop.name}</span>
                {shop.id === activeShopId ? (
                  <Check className="size-4 text-primary" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <button
        type="button"
        onClick={onCommandPaletteOpen}
        className="mx-auto hidden h-8 min-w-0 max-w-xl flex-1 items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:flex"
        aria-label={t("topbar.searchPlaceholder")}
      >
        <Search className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-start">
          {t("topbar.searchPlaceholder")}
        </span>
        <kbd className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <Command className="size-2.5" aria-hidden="true" />K
        </kbd>
      </button>

      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="sm:hidden"
          onClick={onCommandPaletteOpen}
          aria-label={t("topbar.searchPlaceholder")}
        >
          <Search className="size-4" aria-hidden="true" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="hidden gap-1.5 px-2 sm:flex"
              aria-label={t("language.en")}
            >
              <Globe className="size-4" aria-hidden="true" />
              <span className="text-[11px] font-semibold uppercase">{locale}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="shadow-dropdown">
            {LOCALE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => {
                  setLocale(option.value);
                  router.refresh();
                }}
                className="gap-2"
              >
                <span className="text-base" aria-hidden="true">
                  {option.flag}
                </span>
                <span className="flex-1">{option.label}</span>
                {option.value === locale ? (
                  <Check className="size-4 text-primary" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative"
              aria-label={t("common.notifications")}
            >
              <Bell className="size-4" aria-hidden="true" />
              {unreadCount > 0 ? (
                <span className="absolute end-0 top-0 flex min-w-3.5 -translate-y-0.5 translate-x-0.5 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-3.5 text-white rtl:-translate-x-0.5">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 shadow-dropdown">
            <DropdownMenuLabel className="flex items-center justify-between gap-3">
              <span>{t("common.notifications")}</span>
              {unreadCount > 0 ? (
                <Badge variant="secondary" className="px-1.5 text-xs">
                  {t("topbar.newNotifications", {
                    n: String(unreadCount),
                  })}
                </Badge>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                  <Bell
                    className="mb-2 size-5 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("topbar.noNotifications")}
                  </p>
                </div>
              ) : (
                notifications.slice(0, 6).map((notification) => {
                  const presentation =
                    NOTIFICATION_PRESENTATION[notification.type];
                  const Icon = presentation.icon;
                  const content = (
                    <>
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-md ${presentation.className}`}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          {!notification.read ? (
                            <span
                              className="size-1.5 shrink-0 rounded-full bg-primary"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="truncate text-sm font-medium">
                            {notification.title}
                          </span>
                        </span>
                        {notification.body ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {notification.body}
                          </span>
                        ) : null}
                        <span className="block text-[11px] text-muted-foreground/70">
                          {notification.time}
                        </span>
                      </span>
                    </>
                  );

                  return notification.link ? (
                    <DropdownMenuItem
                      key={notification.id}
                      asChild
                      className="cursor-pointer p-0"
                    >
                      <Link
                        href={notification.link}
                        className="flex w-full items-start gap-3 p-3"
                      >
                        {content}
                      </Link>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      key={notification.id}
                      className="flex items-start gap-3 p-3"
                    >
                      {content}
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ms-0.5 rounded-full"
              aria-label={t("common.openMenu")}
            >
              <Avatar className="size-7 ring-1 ring-border">
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {activeShop?.name.charAt(0).toUpperCase() ?? "S"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 shadow-dropdown">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("topbar.user")}</span>
              <span className="text-xs font-normal text-muted-foreground">
                SahelFlow
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User className="me-2 size-4" aria-hidden="true" />
                  {t("topbar.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="me-2 size-4" aria-hidden="true" />
                  {t("nav.settings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href="https://sahelflow.com/help"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <HelpCircle className="me-2 size-4" aria-hidden="true" />
                  {t("topbar.helpSupport")}
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
            >
              <LogOut className="me-2 size-4" aria-hidden="true" />
              {t("topbar.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
