"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Hash, Package, Users } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import { fetcher } from "@/lib/swr/fetcher";
import { flattenNavigationItems } from "@/components/layout/navigation";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Retained for caller compatibility; Phase 5 exposes only executable commands. */
  onAction?: (action: string) => void;
}

interface RecordResult {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Universal SahelFlow navigation and record search.
 *
 * Navigation destinations are derived from the canonical Phase 5 information
 * architecture instead of maintaining a second route list. Quick actions are
 * intentionally omitted until they have a real executable/deep-link contract;
 * the command surface must never advertise a button that only navigates to a
 * page and hopes a caller opens the intended dialog.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: CommandPaletteProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = React.useState("");
  const [records, setRecords] = React.useState<RecordResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const searchGeneration = React.useRef(0);

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

  React.useEffect(() => {
    const generation = ++searchGeneration.current;
    if (!open) return;

    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecords([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearching(false);
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const [ordersRes, customersRes, productsRes] = await Promise.allSettled([
          fetcher<{
            orders: Array<{
              id: string;
              orderNumber: string;
              customer?: { name: string | null };
            }>;
          }>(`/api/orders/search?q=${encodeURIComponent(q)}&limit=5`),
          fetcher<{
            customers: Array<{
              id: string;
              name: string | null;
              phone: string | null;
            }>;
          }>(`/api/customers/search?q=${encodeURIComponent(q)}&limit=5`),
          fetcher<{
            products: Array<{
              id: string;
              name: string;
              sku?: string | null;
            }>;
          }>(`/api/products/search?q=${encodeURIComponent(q)}&limit=5`),
        ]);

        const next: RecordResult[] = [];
        if (ordersRes.status === "fulfilled") {
          for (const order of ordersRes.value.orders) {
            next.push({
              id: `order:${order.id}`,
              label: order.orderNumber,
              sublabel: order.customer?.name ?? undefined,
              href: `/orders/${order.id}`,
              icon: Hash,
            });
          }
        }
        if (customersRes.status === "fulfilled") {
          for (const customer of customersRes.value.customers) {
            next.push({
              id: `customer:${customer.id}`,
              label: customer.name ?? "—",
              sublabel: customer.phone ?? undefined,
              href: `/customers/${customer.id}`,
              icon: Users,
            });
          }
        }
        if (productsRes.status === "fulfilled") {
          for (const product of productsRes.value.products) {
            next.push({
              id: `product:${product.id}`,
              label: product.name,
              sublabel: product.sku ?? undefined,
              href: `/products/${product.id}`,
              icon: Package,
            });
          }
        }

        if (searchGeneration.current === generation) {
          setRecords(next.slice(0, 8));
        }
      } catch {
        if (searchGeneration.current === generation) {
          setRecords([]);
        }
      } finally {
        if (searchGeneration.current === generation) {
          setSearching(false);
        }
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query, open]);

  const navigation = React.useMemo(
    () =>
      flattenNavigationItems().map((item) => ({
        ...item,
        label: t(item.labelKey),
      })),
    [t],
  );

  const visibleNavigation = React.useMemo(() => {
    const q = normalized(query);
    if (!q) return navigation;
    return navigation.filter((item) => {
      const searchable = normalized(
        [item.label, item.href, ...item.keywords].join(" "),
      );
      return searchable.includes(q);
    });
  }, [navigation, query]);

  function runAndClose(action: () => void) {
    onOpenChange(false);
    window.setTimeout(action, 80);
  }

  const hasResults = records.length > 0 || visibleNavigation.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 shadow-popover sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {t("command.searchPlaceholder")}
        </DialogTitle>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:rounded-md [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5"
        >
          <CommandInput
            placeholder={t("command.searchPlaceholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-[min(440px,60dvh)] px-1.5 py-1.5">
            {!hasResults ? (
              <CommandEmpty>
                {searching
                  ? t("command.records.searching")
                  : t("command.noResults", { search: query })}
              </CommandEmpty>
            ) : null}

            {records.length > 0 ? (
              <CommandGroup heading={t("command.group.records")}>
                {records.map((record) => {
                  const Icon = record.icon;
                  return (
                    <CommandItem
                      key={record.id}
                      value={`${record.id}-${record.label}`}
                      onSelect={() =>
                        runAndClose(() => router.push(record.href))
                      }
                    >
                      <Icon
                        className="me-3 size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {record.label}
                        </div>
                        {record.sublabel ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {record.sublabel}
                          </div>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {visibleNavigation.length > 0 ? (
              <CommandGroup heading={t("command.group.navigation")}>
                {visibleNavigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      value={`${item.id}-${item.label}`}
                      onSelect={() =>
                        runAndClose(() => router.push(item.href))
                      }
                    >
                      <Icon
                        className="me-3 size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.label}
                      </span>
                      <span
                        dir="ltr"
                        className="ms-3 hidden max-w-44 truncate font-mono text-[10px] text-muted-foreground/70 sm:inline"
                      >
                        {item.href}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>

          <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono">
              ↑↓
            </kbd>
            <span>{t("command.navigate")}</span>
            <kbd className="ms-2 rounded border bg-muted px-1.5 py-0.5 font-mono">
              ↵
            </kbd>
            <span>{t("command.select")}</span>
            <kbd className="ms-auto rounded border bg-muted px-1.5 py-0.5 font-mono">
              esc
            </kbd>
            <span>{t("command.close")}</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
