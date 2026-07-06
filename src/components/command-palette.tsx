"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShoppingCart, Users, Package, Truck, RotateCcw, MessageCircle, Bot,
  BarChart3, Calculator, Settings, Plus, FileDown, Sparkles, Store,
  Upload, UserCircle, Zap, DatabaseBackup, Hash,
} from "lucide-react";
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import { useI18n } from "@/hooks/use-i18n";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { fetcher } from "@/lib/swr/fetcher";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction?: (action: string) => void;
}

interface CmdItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  keywords: string[];
  action: () => void;
  shortcut?: string;
}

interface RecordResult {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * CommandPalette — the real one (Phase 2).
 *
 * Enhancements over the original:
 *   - Fuzzy search ACTUAL RECORDS (orders, customers, products) via the
 *     existing /api/{resource}/search endpoints — not just nav labels
 *   - Debounced record search (250ms) — only fires when query > 1 char
 *   - Record results appear in a "Records" group above navigation
 *   - Shortcut-hint chips shown on nav items (g o, g c, etc.)
 *   - Records navigate to detail pages on select
 */
export function CommandPalette({ open, onOpenChange, onAction }: CommandPaletteProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const [records, setRecords] = React.useState<RecordResult[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Reset query when palette closes. The setState calls here are intentional
  // — we need to clear the search state when the dialog closes so the next
  // open starts fresh. This is the standard pattern for modal/palette state.
  React.useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecords([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearching(false);
    }
  }, [open]);

  // Debounced record search (only when open + query > 1 char)
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecords([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        // Search orders + customers + products in parallel
        const [ordersRes, customersRes, productsRes] = await Promise.allSettled([
          fetcher<{ orders: Array<{ id: string; orderNumber: string; customer?: { name: string | null } }> }>(`/api/orders/search?q=${encodeURIComponent(q)}&limit=5`),
          fetcher<{ customers: Array<{ id: string; name: string | null; phone: string | null }> }>(`/api/customers/search?q=${encodeURIComponent(q)}&limit=5`),
          fetcher<{ products: Array<{ id: string; name: string; sku?: string | null }> }>(`/api/products/search?q=${encodeURIComponent(q)}&limit=5`),
        ]);

        const results: RecordResult[] = [];
        if (ordersRes.status === "fulfilled") {
          for (const o of ordersRes.value.orders) {
            results.push({
              id: o.id,
              label: o.orderNumber,
              sublabel: o.customer?.name ?? undefined,
              href: `/orders/${o.id}`,
              icon: Hash,
            });
          }
        }
        if (customersRes.status === "fulfilled") {
          for (const c of customersRes.value.customers) {
            results.push({
              id: c.id,
              label: c.name ?? "—",
              sublabel: c.phone ?? undefined,
              href: `/customers/${c.id}`,
              icon: Users,
            });
          }
        }
        if (productsRes.status === "fulfilled") {
          for (const p of productsRes.value.products) {
            results.push({
              id: p.id,
              label: p.name,
              sublabel: p.sku ?? undefined,
              href: `/products/${p.id}`,
              icon: Package,
            });
          }
        }
        setRecords(results.slice(0, 8));
      } catch {
        setRecords([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  const navItems = React.useMemo<CmdItem[]>(() => [
    { id: "nav-dashboard", label: t("command.nav.dashboard"), icon: BarChart3, group: t("command.group.navigation"), keywords: ["dashboard", "home"], action: () => router.push("/dashboard"), shortcut: "g d" },
    { id: "nav-orders", label: t("command.nav.orders"), icon: ShoppingCart, group: t("command.group.navigation"), keywords: ["orders"], action: () => router.push("/orders"), shortcut: "g o" },
    { id: "nav-customers", label: t("command.nav.customers"), icon: Users, group: t("command.group.navigation"), keywords: ["customers"], action: () => router.push("/customers"), shortcut: "g c" },
    { id: "nav-products", label: t("command.nav.products"), icon: Package, group: t("command.group.navigation"), keywords: ["products"], action: () => router.push("/products"), shortcut: "g p" },
    { id: "nav-deliveries", label: t("command.nav.deliveries"), icon: Truck, group: t("command.group.navigation"), keywords: ["deliveries"], action: () => router.push("/deliveries"), shortcut: "g l" },
    { id: "nav-returns", label: t("command.nav.returns"), icon: RotateCcw, group: t("command.group.navigation"), keywords: ["returns"], action: () => router.push("/returns"), shortcut: "g r" },
    { id: "nav-inbox", label: t("command.nav.inbox"), icon: MessageCircle, group: t("command.group.navigation"), keywords: ["inbox", "whatsapp"], action: () => router.push("/inbox"), shortcut: "g i" },
    { id: "nav-ai", label: t("command.nav.ai"), icon: Bot, group: t("command.group.navigation"), keywords: ["ai", "agent"], action: () => router.push("/agents") },
    { id: "nav-analytics", label: t("command.nav.analytics"), icon: BarChart3, group: t("command.group.navigation"), keywords: ["analytics"], action: () => router.push("/analytics"), shortcut: "g a" },
    { id: "nav-accounting", label: t("command.nav.accounting"), icon: Calculator, group: t("command.group.navigation"), keywords: ["accounting"], action: () => router.push("/accounting") },
    { id: "nav-settings", label: t("command.nav.settings"), icon: Settings, group: t("command.group.navigation"), keywords: ["settings"], action: () => router.push("/settings"), shortcut: "g s" },
    { id: "nav-storefronts", label: t("command.nav.storefronts"), icon: Store, group: t("command.group.navigation"), keywords: ["storefronts"], action: () => router.push("/storefronts") },
    { id: "nav-imports", label: t("command.nav.imports"), icon: Upload, group: t("command.group.navigation"), keywords: ["imports"], action: () => router.push("/imports") },
    { id: "nav-profile", label: t("command.nav.profile"), icon: UserCircle, group: t("command.group.navigation"), keywords: ["profile"], action: () => router.push("/profile") },
    { id: "nav-automations", label: t("command.nav.automations"), icon: Zap, group: t("command.group.navigation"), keywords: ["automations"], action: () => router.push("/automations") },
  ], [router, t]);

  const actionItems = React.useMemo<CmdItem[]>(() => [
    { id: "action-new-order", label: t("command.action.newOrder"), icon: Plus, group: t("command.group.quickActions"), keywords: ["new order"], action: () => { router.push("/orders"); onAction?.("new-order"); }, shortcut: "o" },
    { id: "action-new-product", label: t("command.action.newProduct"), icon: Plus, group: t("command.group.quickActions"), keywords: ["new product"], action: () => { router.push("/products"); onAction?.("new-product"); }, shortcut: "p" },
    { id: "action-new-customer", label: t("command.action.newCustomer"), icon: Plus, group: t("command.group.quickActions"), keywords: ["new customer"], action: () => { router.push("/customers"); onAction?.("new-customer"); }, shortcut: "c" },
    { id: "action-export", label: t("command.action.export"), icon: FileDown, group: t("command.group.quickActions"), keywords: ["export", "csv"], action: () => onAction?.("export") },
    { id: "action-ai", label: t("command.action.askAi"), icon: Sparkles, group: t("command.group.quickActions"), keywords: ["ai", "ask"], action: () => router.push("/agents") },
    { id: "action-backup", label: t("command.action.backup"), icon: DatabaseBackup, group: t("command.group.quickActions"), keywords: ["backup"], action: () => router.push("/settings") },
  ], [router, onAction, t]);

  const groupedNav = React.useMemo(() => {
    const groups: Record<string, CmdItem[]> = {};
    for (const item of [...navItems, ...actionItems]) {
      (groups[item.group] ??= []).push(item);
    }
    return groups;
  }, [navItems, actionItems]);

  function runAndClose(action: () => void) {
    onOpenChange(false);
    setTimeout(action, 150);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-elevated max-w-lg">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5" shouldFilter={false}>
          <CommandInput
            placeholder={t("command.searchPlaceholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>
              {searching ? t("command.records.searching") : t("command.noResults", { search: "" })}
            </CommandEmpty>

            {/* Records group (fuzzy search results) */}
            {records.length > 0 && (
              <CommandGroup heading={t("command.group.records")}>
                {records.map((r) => {
                  const Icon = r.icon;
                  return (
                    <CommandItem
                      key={r.id}
                      value={`record-${r.id}-${r.label}`}
                      onSelect={() => runAndClose(() => router.push(r.href))}
                    >
                      <Icon className="me-3 h-4 w-4 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span>{r.label}</span>
                        {r.sublabel && <span className="text-xs text-muted-foreground">{r.sublabel}</span>}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Navigation + actions groups */}
            {Object.entries(groupedNav).map(([group, groupItems]) => (
              <CommandGroup key={group} heading={group}>
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${item.label} ${item.keywords.join(" ")}`}
                      onSelect={() => runAndClose(item.action)}
                    >
                      <Icon className="me-3 h-4 w-4 text-muted-foreground" />
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <kbd className="ms-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {item.shortcut}
                        </kbd>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="border-t border-border px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
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
