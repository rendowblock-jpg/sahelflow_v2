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
} from "lucide-react";
import { Command } from "@/components/ui/command";
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

  const items = React.useMemo<CommandItem[]>(() => [
    // Navigation
    { id: "nav-dashboard", label: "Tableau de bord", icon: BarChart3, group: "Navigation", keywords: ["dashboard", "accueil", "home"], action: () => router.push("/dashboard") },
    { id: "nav-orders", label: "Commandes", icon: ShoppingCart, group: "Navigation", keywords: ["orders", "commandes", "طلبات"], action: () => router.push("/orders") },
    { id: "nav-customers", label: "Clients", icon: Users, group: "Navigation", keywords: ["customers", "clients", "عملاء"], action: () => router.push("/customers") },
    { id: "nav-products", label: "Produits", icon: Package, group: "Navigation", keywords: ["products", "produits", "منتجات"], action: () => router.push("/products") },
    { id: "nav-deliveries", label: "Livraisons", icon: Truck, group: "Navigation", keywords: ["deliveries", "livraisons", "توصيل"], action: () => router.push("/deliveries") },
    { id: "nav-returns", label: "Retours", icon: RotateCcw, group: "Navigation", keywords: ["returns", "retours", "مرتجعات"], action: () => router.push("/returns") },
    { id: "nav-inbox", label: "Boîte de réception", icon: MessageCircle, group: "Navigation", keywords: ["inbox", "messages", "whatsapp", "رسائل"], action: () => router.push("/inbox") },
    { id: "nav-ai", label: "Agent IA", icon: Bot, group: "Navigation", keywords: ["ai", "agent", "intelligence", "ذكاء"], action: () => router.push("/agents") },
    { id: "nav-analytics", label: "Analytique", icon: BarChart3, group: "Navigation", keywords: ["analytics", "analytique", "إحصائيات"], action: () => router.push("/analytics") },
    { id: "nav-accounting", label: "Comptabilité", icon: Calculator, group: "Navigation", keywords: ["accounting", "comptabilité", "محاسبة"], action: () => router.push("/accounting") },
    { id: "nav-settings", label: "Paramètres", icon: Settings, group: "Navigation", keywords: ["settings", "paramètres", "إعدادات"], action: () => router.push("/settings") },
    // Actions
    { id: "action-new-order", label: "Nouvelle commande", icon: Plus, group: "Actions rapides", keywords: ["new order", "nouvelle commande", "طلب جديد"], action: () => { router.push("/orders"); onAction?.("new-order"); } },
    { id: "action-new-product", label: "Ajouter un produit", icon: Plus, group: "Actions rapides", keywords: ["new product", "nouveau produit", "منتج جديد"], action: () => { router.push("/products"); onAction?.("new-product"); } },
    { id: "action-export", label: "Exporter les données", icon: FileDown, group: "Actions rapides", keywords: ["export", "csv", "excel", "تصدير"], action: () => onAction?.("export") },
    { id: "action-ai", label: "Demander à l'IA", icon: Sparkles, group: "Actions rapides", keywords: ["ai", "ask", "question", "سؤال"], action: () => router.push("/agents") },
  ], [router, onAction]);

  const [search, setSearch] = React.useState("");

  // Group items
  const grouped = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    const filtered = items.filter(item =>
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.keywords.some(k => k.toLowerCase().includes(search.toLowerCase()))
    );
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
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
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              cmdk-input=""
              placeholder="Rechercher une page ou une action..."
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
                      <Icon className="mr-3 h-4 w-4 text-muted-foreground" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Aucun résultat pour &ldquo;{search}&rdquo;
              </div>
            )}
          </div>
          <div className="border-t border-border px-3 py-2 flex items-center gap-2 text-[10px] text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">↑↓</kbd>
            <span>naviguer</span>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono ml-2">↵</kbd>
            <span>sélectionner</span>
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono ml-2">esc</kbd>
            <span>fermer</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
