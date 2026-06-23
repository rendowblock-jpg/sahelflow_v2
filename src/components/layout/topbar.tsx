"use client";

import { useEffect, useState, useCallback } from "react";
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
  Package,
} from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";

const LOCALE_OPTIONS: Array<{ value: Locale; label: string; flag: string }> = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "ar", label: "العربية", flag: "🇩🇿" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

/** Notification shape from the API. */
interface Notification {
  id: string;
  type: "order" | "delivery" | "stock" | "info";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const NOTIFICATION_ICONS: Record<string, typeof ShoppingCart> = {
  order: ShoppingCart,
  delivery: Truck,
  stock: Package,
  info: Bell,
};

const NOTIFICATION_COLORS: Record<string, string> = {
  order: "bg-primary",
  delivery: "bg-emerald-500",
  stock: "bg-amber-500",
  info: "bg-sky-500",
};

interface TopbarProps {
  onCommandPaletteOpen?: () => void;
}

export function Topbar({ onCommandPaletteOpen }: TopbarProps) {
  const { t, locale, setLocale } = useI18n();
  const shops = useShopStore((s) => s.shops);
  const activeShopId = useShopStore((s) => s.activeShopId);
  const loaded = useShopStore((s) => s.loaded);
  const setActiveShop = useShopStore((s) => s.setActiveShop);
  const loadShops = useShopStore((s) => s.loadShops);

  // Real notification state
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Load the shop list + active shop ID from the API on mount
  useEffect(() => {
    void loadShops();
  }, [loadShops]);

  // Load real notifications from API
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
    // Defer the initial fetch to a timer so no setState runs synchronously
    // in the effect body (avoids cascading renders). Polling continues every 60s.
    const initial = setTimeout(() => void loadNotifications(), 0);
    const interval = setInterval(() => void loadNotifications(), 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeShop = shops.find((s) => s.id === activeShopId) ?? null;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 glass px-4 sm:px-6">
      {/* Left: Mobile sidebar toggle + shop selector */}
      <div className="flex items-center gap-3">
        {/* Mobile sidebar (hidden on desktop) */}
        <div className="lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <Sidebar />
            </SheetContent>
          </Sheet>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium hidden sm:inline">
                {loaded ? (activeShop?.name ?? t("topbar.selectShop")) : t("topbar.loading")}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t("nav.groupWorkspace")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {shops.map((shop) => (
              <DropdownMenuItem
                key={shop.id}
                onClick={() => void setActiveShop(shop.id)}
                className="gap-2"
              >
                <span className="text-lg">{shop.icon ?? "🏪"}</span>
                <span className="flex-1">{shop.name}</span>
                {shop.id === activeShopId && (
                  <span className="text-xs text-muted-foreground">●</span>
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
          className="hidden sm:flex flex-1 max-w-md items-center gap-3 h-9 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground hover:bg-muted/80 hover:border-border/80 transition-colors cursor-pointer"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 text-left truncate">{t("topbar.searchPlaceholder")}</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm">
            <Command className="size-2.5" />K
          </kbd>
        </button>
      )}

      {/* Right: Language + Theme + Notifications + Avatar */}
      <div className="flex items-center gap-1 ml-auto">
        <Badge variant="outline" className="gap-1.5 text-muted-foreground hidden md:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="text-xs">{t("nav.agents")}: —</span>
        </Badge>

        <Separator orientation="vertical" className="h-6 hidden md:block" />

        {/* Language switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Globe className="h-4 w-4" />
              <span className="text-sm uppercase">{locale}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LOCALE_OPTIONS.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setLocale(opt.value)}
                className="gap-2"
              >
                <span className="text-base">{opt.flag}</span>
                <span className="flex-1">{opt.label}</span>
                {opt.value === locale && <span className="text-xs">●</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notifications — real data */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 relative">
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white animate-pulse-subtle">
                  {unreadCount}
                </span>
              )}
              <span className="sr-only">{t("common.notifications")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 shadow-elevated">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{t("common.notifications")}</span>
              {unreadCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {t("topbar.newNotifications").replace("{n}", String(unreadCount))}
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
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
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${dotColor} text-white`}>
                        <IconComp className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!notif.read && (
                            <span className={`h-1.5 w-1.5 rounded-full ${dotColor} shrink-0`} />
                          )}
                          <span className={`text-sm font-medium truncate ${notif.read ? "text-muted-foreground" : ""}`}>
                            {notif.title}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">{notif.time}</span>
                      </div>
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuGroup>
            {notifications.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-center justify-center text-primary text-sm cursor-pointer">
                  {t("topbar.viewAllNotifications")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full ml-1">
              <Avatar className="size-8 ring-1 ring-border">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                  {activeShop?.name.charAt(0).toUpperCase() ?? "S"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 shadow-elevated">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("topbar.user")}</span>
              <span className="text-xs text-muted-foreground font-normal">SahelFlow</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 size-4" />
                {t("topbar.profile")}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/settings">
                  <Settings className="mr-2 size-4" />
                  {t("nav.settings")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <HelpCircle className="mr-2 size-4" />
                {t("topbar.helpSupport")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="cursor-pointer">
              <LogOut className="mr-2 size-4" />
              {t("topbar.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
