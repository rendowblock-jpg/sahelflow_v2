"use client";


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
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./sidebar";
import { Globe, Store, ChevronDown, AlertCircle, Menu } from "lucide-react";
import type { Locale } from "@/lib/i18n";

const LOCALE_OPTIONS: Array<{ value: Locale; label: string; flag: string }> = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "ar", label: "العربية", flag: "🇩🇿" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

export function Topbar() {
  const { t, locale, setLocale } = useI18n();
  const shops = useShopStore((s) => s.shops);
  const activeShopId = useShopStore((s) => s.activeShopId);
  const setActiveShop = useShopStore((s) => s.setActiveShop);
  const activeShop = shops.find((s) => s.id === activeShopId) ?? null;

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-4 gap-4">
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
              <Store className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium hidden sm:inline">{activeShop?.name ?? t("nav.dashboard")}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{t("nav.groupWorkspace")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {shops.map((shop) => (
              <DropdownMenuItem
                key={shop.id}
                onClick={() => setActiveShop(shop.id)}
                className="gap-2"
              >
                <span className="text-lg">{shop.icon ?? "🏪"}</span>
                <span className="flex-1">{shop.name}</span>
                {shop.id === activeShopId && (
                  <span className="text-xs text-muted-foreground">●</span>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-muted-foreground">
              + {t("nav.more")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right: AI status + language + theme + avatar */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1.5 text-muted-foreground hidden md:flex">
          <AlertCircle className="h-3 w-3" />
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

        {/* Avatar */}
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {activeShop?.name.charAt(0).toUpperCase() ?? "S"}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
