"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-i18n";
import { useShopStore } from "@/stores/shop-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import {
  Globe,
  Store,
  ChevronDown,
  Menu,
  Bell,
  Search,
  Command,
  User,
  Settings,
  HelpCircle,
  LogOut,
  ShoppingCart,
  Truck,
  Package, RotateCcw, AlertCircle} from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { logoutAndRedirect } from "@/lib/auth/logout-client";

const LOCALE_OPTIONS: Array<{ value: Locale; label: string; flag: string }> = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "ar", label: "العربية", flag: "🇩🇿" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

interface TopbarProps {
  onCommandPaletteOpen: () => void;
  /** Server-rendered locale (from cookie) — used for initial render */
  serverLocale: Locale;
  /** Server-rendered direction (from cookie) — used for initial render */
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

const NOTIFICATION_ICONS: Record<string, typeof ShoppingCart> = {
  order: ShoppingCart,
  delivery: Truck,
  stock: Package,
  info: Bell,
  return: RotateCcw,
  alert: AlertCircle,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  order: "bg-primary",
  delivery: "bg-success",
  stock: "bg-warning",
  info: "bg-teal-500",
  return: "bg-violet-500",
  alert: "bg-destructive",
};

export function Topbar({ onCommandPaletteOpen, serverLocale, serverDir }: TopbarProps) {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const shops = useShopStore((s) => s.shops);
  const activeShopId = useShopStore((s) => s.activeShopId);
  const loaded = useShopStore((s) => s.loaded);
  const switchStatus = useShopStore((s) => s.switchStatus);
  const switchTargetId = useShopStore((s) => s.switchTargetId);
  const switchError = useShopStore((s) => s.switchError);
  const setActiveShop = useShopStore((s) => s.setActiveShop);
  const loadShops = useShopStore((s) => s.loadShops);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
      }
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void loadNotifications(), 0);
    const interval = setInterval(() => void loadNotifications(), 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeShop = shops.find((s) => s.id === activeShopId) ?? null;
  const switchTarget = shops.find((s) => s.id === switchTargetId) ?? null;
  const isRtl = serverDir === "rtl";

  const handleShopSwitch = useCallback(async (shopId: string) => {
    try {
      await setActiveShop(shopId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("topbar.shopSwitchBlocked"),
      );
    }
  }, [setActiveShop, t]);

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

  return (
    <header className="sticky top-0 z-30 flex h-14 lg:h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:gap-3 sm:px-4 lg:px-3">
      {/* Start: Mobile sidebar toggle + shop selector */}
      <div className="flex items-center gap-2">
        {/* Mobile sidebar (hidden on desktop) */}
        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("common.openMenu")}>
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side={isRtl ? "right" : "left"} className="w-72 p-0">
              <Sidebar serverLocale={serverLocale} serverDir={serverDir} />
            </SheetContent>
          </Sheet>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 px-2 font-medium"
              aria-live="polite"
              title={switchStatus === "blocked" ? (switchError ?? undefined) : undefined}
            >
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">
                {switchStatus === "pending"
                  ? t("topbar.shopSwitchPending", { shop: switchTarget?.name ?? "" })
                  : switchStatus === "blocked"
                    ? t("topbar.shopSwitchBlocked", { shop: switchTarget?.name ?? "" })
                    : loaded
                      ? (activeShop?.name ?? t("topbar.selectShop"))
                      : t("topbar.loading")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 shadow-dropdown">
            <DropdownMenuLabel>{t("nav.groupWorkspace")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {shops.map((shop) => (
              <DropdownMenuItem
                key={shop.id}
                onClick={() => void handleShopSwitch(shop.id)}
                disabled={switchStatus === "pending" || shop.id === activeShopId}
                className="gap-2"
              >
                <span className="text-base">{shop.icon ?? "🏪"}</span>
                <span className="flex-1">{shop.name}</span>
                {shop.id === activeShopId && (
                  <span className="size-1.5 rounded-full bg-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center: Search / Command Palette Trigger */}
      {onCommandPaletteOpen && (
        <button
          onClick={onCommandPaletteOpen}
          className="hidden sm:flex h-8 flex-1 max-w-md items-center gap-2 rounded-lg border bg-muted/50 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:border-border"
        >
          <Search className="size-3.5 shrink-0" />
          <span className="flex-1 text-start truncate">{t("topbar.searchPlaceholder")}</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-xs font-medium text-muted-foreground">
            <Command className="size-2.5" />K
          </kbd>
        </button>
      )}

      {/* End: Live indicator + Language + Theme + Notifications + Avatar */}
      <div className="flex items-center gap-1 ms-auto">
        {/* Live indicator — hidden on mobile */}
        <div className="hidden md:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-0.5">
          <span className="size-1.5 rounded-full bg-success animate-pulse-subtle" />
          <span className="text-xs font-medium text-success">{t("common.live")}</span>
        </div>

        <Separator orientation="vertical" className="mx-1 h-5 hidden md:block" />

        {/* Language switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5 px-2">
              <Globe className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">{locale}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="shadow-dropdown">
            {LOCALE_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => {
                  setLocale(opt.value);
                  // Refresh the server layout so it re-reads the cookie and
                  // re-renders with the new locale + dir (no full page reload).
                  router.refresh();
                }}
                className="gap-2"
              >
                <span className="text-base">{opt.flag}</span>
                <span className="flex-1">{opt.label}</span>
                {opt.value === locale && <span className="size-1.5 rounded-full bg-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative">
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute end-0 top-0 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
              <span className="sr-only">{t("common.notifications")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 shadow-dropdown">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{t("common.notifications")}</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5">
                  {t("topbar.newNotifications", { n: String(unreadCount) })}
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Bell className="h-6 w-6 text-muted-foreground/40 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {t("topbar.noNotifications")}
                  </p>
                </div>
              ) : (
                notifications.slice(0, 5).map((notif) => {
                  const IconComp = NOTIFICATION_ICONS[notif.type] ?? Bell;
                  const dotColor = NOTIFICATION_COLORS[notif.type] ?? "bg-primary";
                  return (
                    <DropdownMenuItem
                      key={notif.id}
                      className="flex items-start gap-3 p-3 cursor-pointer"
                      asChild={notif.link ? true : undefined}
                    >
                      {notif.link ? (
                        <Link href={notif.link}>
                          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${dotColor} text-white`}>
                            <IconComp className="h-3.5 w-3.5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {!notif.read && (
                                <span className={`size-1.5 rounded-full ${dotColor} shrink-0`} />
                              )}
                              <span className={`text-sm font-medium truncate ${notif.read ? "text-muted-foreground" : ""}`}>
                                {notif.title}
                              </span>
                            </div>
                            {notif.body && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{notif.body}</p>
                            )}
                            <span className="text-xs text-muted-foreground/70">{notif.time}</span>
                          </div>
                        </Link>
                      ) : (
                        <>
                          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${dotColor} text-white`}>
                            <IconComp className="h-3.5 w-3.5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {!notif.read && (
                                <span className={`size-1.5 rounded-full ${dotColor} shrink-0`} />
                              )}
                              <span className={`text-sm font-medium truncate ${notif.read ? "text-muted-foreground" : ""}`}>
                                {notif.title}
                              </span>
                            </div>
                            {notif.body && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{notif.body}</p>
                            )}
                            <span className="text-xs text-muted-foreground/70">{notif.time}</span>
                          </div>
                        </>
                      )}
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuGroup>
            {notifications.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-center justify-center text-primary text-sm cursor-pointer" asChild>
                  <Link href="/settings">
                    {t("topbar.viewAllNotifications")}
                  </Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="rounded-full ms-0.5" aria-label={t("common.openMenu")}>
              <Avatar className="size-7 ring-1 ring-border">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {activeShop?.name.charAt(0).toUpperCase() ?? "S"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 shadow-dropdown">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("topbar.user")}</span>
              <span className="text-xs text-muted-foreground font-normal">SahelFlow</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/profile">
                  <User className="me-2 size-4" />
                  {t("topbar.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/settings">
                  <Settings className="me-2 size-4" />
                  {t("nav.settings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <a href="https://sahelflow.com/help" target="_blank" rel="noopener noreferrer">
                  <HelpCircle className="me-2 size-4" />
                  {t("topbar.helpSupport")}
                </a>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
            >
              <LogOut className="me-2 size-4" />
              {t("topbar.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
