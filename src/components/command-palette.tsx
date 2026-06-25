"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ShoppingCart,
  Users,
  Package,
  Truck,
  RotateCcw,
  MessageCircle,
  Bot,
  BarChart3,
  Calculator,
  Settings,
  Plus,
  FileDown,
  Sparkles,
  Store,
  Upload,
  UserCircle,
  Zap,
  DatabaseBackup,
} from "lucide-react";
import { Command } from "@/components/ui/command";
import { useI18n } from "@/hooks/use-i18n";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction?: (action: string) => void;
}

interface CommandItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  keywords: string[];
  action: () => void;
}


export function CommandPalette({ open, onOpenChange, onAction }: CommandPaletteProps) {
  const router = useRouter();
  const { t } = useI18n();

  const items = React.useMemo<CommandItem[]>(() => [
    // Navigation
    { id: "nav-dashboard", label: t("command.nav.dashboard"), icon: BarChart3, group: t("command.group.navigation"), keywords: ["dashboard", "accueil", "home"], action: () => router.push("/dashboard") },
    { id: "nav-orders", label: t("command.nav.orders"), icon: ShoppingCart, group: t("command.group.navigation"), keywords: ["orders", "commandes", "طلبات"], action: () => router.push("/orders") },
    { id: "nav-customers", label: t("command.nav.customers"), icon: Users, group: t("command.group.navigation"), keywords: ["customers", "clients", "عملاء"], action: () => router.push("/customers") },
    { id: "nav-products", label: t("command.nav.products"), icon: Package, group: t("command.group.navigation"), keywords: ["products", "produits", "منتجات"], action: () => router.push("/products") },
    { id: "nav-deliveries", label: t("command.nav.deliveries"), icon: Truck, group: t("command.group.navigation"), keywords: ["deliveries", "livraisons", "توصيل"], action: () => router.push("/deliveries") },
    { id: "nav-returns", label: t("command.nav.returns"), icon: RotateCcw, group: t("command.group.navigation"), keywords: ["returns", "retours", "مرتجعات"], action: () => router.push("/returns") },
    { id: "nav-inbox", label: t("command.nav.inbox"), icon: MessageCircle, group: t("command.group.navigation"), keywords: ["inbox", "messages", "whatsapp", "رسائل"], action: () => router.push("/inbox") },
    { id: "nav-ai", label: t("command.nav.ai"), icon: Bot, group: t("command.group.navigation"), keywords: ["ai", "agent", "intelligence", "ذكاء"], action: () => router.push("/agents") },
    { id: "nav-analytics", label: t("command.nav.analytics"), icon: BarChart3, group: t("command.group.navigation"), keywords: ["analytics", "analytique", "إحصائيات"], action: () => router.push("/analytics") },
    { id: "nav-accounting", label: t("command.nav.accounting"), icon: Calculator, group: t("command.group.navigation"), keywords: ["accounting", "comptabilité", "محاسبة"], action: () => router.push("/accounting") },
    { id: "nav-settings", label: t("command.nav.settings"), icon: Settings, group: t("command.group.navigation"), keywords: ["settings", "paramètres", "إعدادات"], action: () => router.push("/settings") },
    { id: "nav-storefronts", label: t("command.nav.storefronts"), icon: Store, group: t("command.group.navigation"), keywords: ["storefronts", "boutiques", "متاجر"], action: () => router.push("/storefronts") },
    { id: "nav-imports", label: t("command.nav.imports"), icon: Upload, group: t("command.group.navigation"), keywords: ["imports", "import", "استيراد"], action: () => router.push("/imports") },
    { id: "nav-profile", label: t("command.nav.profile"), icon: UserCircle, group: t("command.group.navigation"), keywords: ["profile", "profil", "ملف شخصي"], action: () => router.push("/profile") },
    { id: "nav-automations", label: t("command.nav.automations"), icon: Zap, group: t("command.group.navigation"), keywords: ["automations", "automatisation", "أتمتة"], action: () => router.push("/automations") },
    // Actions
    { id: "action-new-order", label: t("command.action.newOrder"), icon: Plus, group: t("command.group.quickActions"), keywords: ["new order", "nouvelle commande", "طلب جديد"], action: () => { router.push("/orders"); onAction?.("new-order"); } },
    { id: "action-new-product", label: t("command.action.newProduct"), icon: Plus, group: t("command.group.quickActions"), keywords: ["new product", "nouveau produit", "منتج جديد"], action: () => { router.push("/products"); onAction?.("new-product"); } },
    { id: "action-export", label: t("command.action.export"), icon: FileDown, group: t("command.group.quickActions"), keywords: ["export", "csv", "excel", "تصدير"], action: () => onAction?.("export") },
    { id: "action-ai", label: t("command.action.askAi"), icon: Sparkles, group: t("command.group.quickActions"), keywords: ["ai", "ask", "question", "سؤال"], action: () => router.push("/agents") },
    { id: "action-backup", label: t("command.action.backup"), icon: DatabaseBackup, group: t("command.group.quickActions"), keywords: ["backup", "sauvegarde", "نسخ احتياطي"], action: () => router.push("/settings") },
  ], [router, onAction, t]);

  const [search, setSearch] = React.useState("");

  // Group items
  const grouped = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    const filtered = items.filter(item =>
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.keywords.some(k => k.toLowerCase().includes(search.toLowerCase()))
    );
    for (const item of filtered) {
      const list = groups[item.group] ?? (groups[item.group] = []);
      list.push(item);
    }
    return groups;
  }, [items, search]);

  function runAndClose(action: () => void) {
    onOpenChange(false);
    setSearch("");
    // Small delay so dialog closes first
    setTimeout(action, 150);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearch(""); }}>
      <DialogContent className="overflow-hidden p-0 shadow-elevated max-w-lg">
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5">
          <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
            <Search className="me-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              cmdk-input=""
              placeholder={t("command.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto p-1">
            {Object.entries(grouped).map(([group, groupItems]) => (
              <div key={group} cmdk-group="" className="py-1.5">
                <div cmdk-group-heading="" className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  {group}
                </div>
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      cmdk-item=""
                      className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 transition-colors"
                      onClick={() => runAndClose(item.action)}
                    >
                      <Icon className="me-3 h-4 w-4 text-muted-foreground" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("command.noResults", { search })}
              </div>
            )}
          </div>
          <div className="border-t border-border px-3 py-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑↓</kbd>
            <span>{t("command.navigate")}</span>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono ms-2">↵</kbd>
            <span>{t("command.select")}</span>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono ms-2">esc</kbd>
            <span>{t("command.close")}</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
