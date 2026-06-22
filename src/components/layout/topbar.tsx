"use client";

import { useEffect } from "react";
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
} from "lucide-react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";

const LOCALE_OPTIONS: Array<{ value: Locale; label: string; flag: string }> = [
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "ar", label: "العربية", flag: "🇩🇿" },
  { value: "en", label: "English", flag: "🇬🇧" },
];

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

  // Load the shop list + active shop ID from the API on mount
  useEffect(() => {
    void loadShops();
  }, [loadShops]);

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
                {loaded ? (activeShop?.name ?? "Sélectionner") : "Chargement…"}
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
          <span className="flex-1 text-left truncate">Rechercher...</span>
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

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 relative">
              <Bell className="size-4" />
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white animate-pulse-subtle">
                3
              </span>
              <span className="sr-only">Notifications</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 shadow-elevated">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <Badge variant="secondary" className="text-[10px] px-1.5">3 nouvelles</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                <div className="flex items-center gap-2 w-full">
                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <span className="text-sm font-medium flex-1">Nouvelle commande #2847</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">Il y a 5 minutes</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                <div className="flex items-center gap-2 w-full">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-sm font-medium flex-1">Livraison confirmée — Alger Centre</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">Il y a 23 minutes</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                <div className="flex items-center gap-2 w-full">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-sm font-medium flex-1">Alerte stock faible</span>
                </div>
                <span className="text-xs text-muted-foreground pl-4">Il y a 1 heure</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-center justify-center text-primary text-sm cursor-pointer">
              Voir toutes les notifications
            </DropdownMenuItem>
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
              <span className="text-sm font-medium">Utilisateur</span>
              <span className="text-xs text-muted-foreground font-normal">SahelFlow</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="cursor-pointer">
                <User className="mr-2 size-4" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" asChild>
                <Link href="/settings">
                  <Settings className="mr-2 size-4" />
                  Paramètres
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer">
                <HelpCircle className="mr-2 size-4" />
                Aide & Support
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="cursor-pointer">
              <LogOut className="mr-2 size-4" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
