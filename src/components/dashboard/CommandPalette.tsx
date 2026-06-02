"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Truck,
  BarChart3,
  Settings,
  Plus,
  Store,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface CmdItem {
  id: string;
  label: string;
  href?: string;
  icon: typeof LayoutDashboard;
  section: "navigation" | "actions" | "orders";
  keywords: string;
}

export default function CommandPalette() {
  const { t } = useI18n();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [orderResults, setOrderResults] = useState<
    Array<{
      id: string;
      order_number: string;
      customer_name: string | null;
      wilaya: string | null;
    }>
  >([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setOrderResults([]);
  }, []);

  const openPalette = useCallback(() => {
    setOpen(true);
    setQuery("");
    setActiveIndex(0);
    setOrderResults([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Keyboard listener: Ctrl+K / Cmd+K
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) {
          close();
        } else {
          openPalette();
        }
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, close, openPalette]);

  // Custom event from Topbar
  useEffect(() => {
    function handleEvent() {
      if (!open) openPalette();
    }
    window.addEventListener("open-command-palette", handleEvent);
    return () =>
      window.removeEventListener("open-command-palette", handleEvent);
  }, [open, openPalette]);

  // Build navigation items
  const navItems: CmdItem[] = [
    {
      id: "nav-dashboard",
      label: t.nav.dashboard,
      href: "/dashboard",
      icon: LayoutDashboard,
      section: "navigation",
      keywords: "dashboard home",
    },
    {
      id: "nav-orders",
      label: t.nav.orders,
      href: "/dashboard/orders",
      icon: ShoppingCart,
      section: "navigation",
      keywords: "orders",
    },
    {
      id: "nav-products",
      label: t.nav.products,
      href: "/dashboard/products",
      icon: Package,
      section: "navigation",
      keywords: "products catalog",
    },
    {
      id: "nav-customers",
      label: t.nav.customers,
      href: "/dashboard/customers",
      icon: Users,
      section: "navigation",
      keywords: "customers clients",
    },
    {
      id: "nav-delivery",
      label: t.nav.delivery,
      href: "/dashboard/delivery",
      icon: Truck,
      section: "navigation",
      keywords: "delivery shipping",
    },
    {
      id: "nav-analytics",
      label: t.nav.analytics,
      href: "/dashboard/analytics",
      icon: BarChart3,
      section: "navigation",
      keywords: "analytics stats",
    },
    {
      id: "nav-settings",
      label: t.nav.settings,
      href: "/dashboard/settings",
      icon: Settings,
      section: "navigation",
      keywords: "settings config",
    },
  ];

  const actionItems: CmdItem[] = [
    {
      id: "action-new-order",
      label: t.dashboard.newOrder,
      href: "/dashboard/orders",
      icon: Plus,
      section: "actions",
      keywords: "new order create",
    },
    {
      id: "action-add-product",
      label: t.dashboard.addProduct,
      href: "/dashboard/products",
      icon: Package,
      section: "actions",
      keywords: "add product new",
    },
    {
      id: "action-open-store",
      label: t.commandPalette.openStore,
      href: "/",
      icon: Store,
      section: "actions",
      keywords: "open store shop",
    },
  ];

  // Fuzzy filter
  function matches(item: CmdItem, q: string): boolean {
    if (!q) return true;
    const lower = q.toLowerCase();
    return (
      item.label.toLowerCase().includes(lower) ||
      item.keywords.toLowerCase().includes(lower)
    );
  }

  const filteredNav = navItems.filter((i) => matches(i, query));
  const filteredActions = actionItems.filter((i) => matches(i, query));
  const isOrderSearch = /^(SF-|\d)/.test(query.trim());

  // Debounced order search
  useEffect(() => {
    if (!isOrderSearch || !open) {
      setOrderResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingOrders(true);
      try {
        const { data } = await supabase
          .from("orders")
          .select("id, order_number, customer:customers(name), wilaya")
          .ilike("order_number", `%${query.trim()}%`)
          .order("created_at", { ascending: false })
          .limit(5);
        if (data) {
          setOrderResults(
            data.map((o) => ({
              id: o.id,
              order_number: o.order_number,
              customer_name:
                (o.customer as unknown as { name: string } | null)?.name ||
                null,
              wilaya: o.wilaya,
            })),
          );
        }
      } catch {
        setOrderResults([]);
      } finally {
        setLoadingOrders(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, open, isOrderSearch, supabase]);

  // Build flat list for keyboard nav
  const flatList: Array<{
    id: string;
    label: string;
    href?: string;
    icon: typeof LayoutDashboard;
    section: string;
  }> = [];
  if (filteredNav.length > 0) {
    filteredNav.forEach((i) => flatList.push(i));
  }
  if (filteredActions.length > 0) {
    filteredActions.forEach((i) => flatList.push(i));
  }
  if (isOrderSearch && orderResults.length > 0) {
    orderResults.forEach((o) =>
      flatList.push({
        id: o.id,
        label: `${o.order_number} — ${o.customer_name || "—"} — ${o.wilaya || "—"}`,
        href: "/dashboard/orders",
        icon: ShoppingCart,
        section: "orders",
      }),
    );
  }

  // Clamp activeIndex
  useEffect(() => {
    if (activeIndex >= flatList.length)
      setActiveIndex(Math.max(0, flatList.length - 1));
  }, [flatList.length, activeIndex]);

  // Keyboard nav in list
  function handleInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatList[activeIndex]) {
      e.preventDefault();
      selectItem(flatList[activeIndex]);
    }
  }

  function selectItem(item: { href?: string }) {
    if (item.href) {
      router.push(item.href);
    }
    close();
  }

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const activeEl = list.querySelector(
      ".sf-cmd-item--active",
    ) as HTMLElement | null;
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  let idx = 0;

  return (
    <div className="sf-cmd-backdrop" onClick={close}>
      <div className="sf-cmd-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-line-primary)",
          }}
        >
          <Search
            size={18}
            style={{ color: "var(--color-content-tertiary)", flexShrink: 0 }}
          />
          <input
            ref={inputRef}
            className="sf-cmd-input"
            placeholder={t.commandPalette.placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKey}
          />
          <kbd className="sf-cmd-kbd">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="sf-cmd-list">
          {/* Navigation */}
          {filteredNav.length > 0 && (
            <>
              <div className="sf-cmd-section">
                {t.commandPalette.navigation}
              </div>
              {filteredNav.map((item) => {
                const currentIdx = idx++;
                return (
                  <div
                    key={item.id}
                    className={`sf-cmd-item ${currentIdx === activeIndex ? "sf-cmd-item--active" : ""}`}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setActiveIndex(currentIdx)}
                  >
                    <item.icon
                      size={16}
                      style={{
                        color: "var(--color-content-tertiary)",
                        flexShrink: 0,
                      }}
                    />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </>
          )}

          {/* Quick Actions */}
          {filteredActions.length > 0 && (
            <>
              <div className="sf-cmd-section">
                {t.commandPalette.quickActions}
              </div>
              {filteredActions.map((item) => {
                const currentIdx = idx++;
                return (
                  <div
                    key={item.id}
                    className={`sf-cmd-item ${currentIdx === activeIndex ? "sf-cmd-item--active" : ""}`}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setActiveIndex(currentIdx)}
                  >
                    <item.icon
                      size={16}
                      style={{
                        color: "var(--color-content-tertiary)",
                        flexShrink: 0,
                      }}
                    />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </>
          )}

          {/* Recent Orders (only when searching order-like query) */}
          {isOrderSearch && (
            <>
              <div className="sf-cmd-section">
                {t.commandPalette.recentOrders}
              </div>
              {loadingOrders ? (
                <div className="sf-cmd-empty">{t.common.loading}</div>
              ) : orderResults.length > 0 ? (
                orderResults.map((o) => {
                  const currentIdx = idx++;
                  return (
                    <div
                      key={o.id}
                      className={`sf-cmd-item ${currentIdx === activeIndex ? "sf-cmd-item--active" : ""}`}
                      onClick={() => selectItem({ href: "/dashboard/orders" })}
                      onMouseEnter={() => setActiveIndex(currentIdx)}
                    >
                      <ShoppingCart
                        size={16}
                        style={{
                          color: "var(--color-content-tertiary)",
                          flexShrink: 0,
                        }}
                      />
                      <span>
                        {o.order_number} — {o.customer_name || "—"} —{" "}
                        {o.wilaya || "—"}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="sf-cmd-empty">{t.commandPalette.noResults}</div>
              )}
            </>
          )}

          {/* No results at all */}
          {filteredNav.length === 0 &&
            filteredActions.length === 0 &&
            !isOrderSearch && (
              <div className="sf-cmd-empty">{t.commandPalette.noResults}</div>
            )}
        </div>
      </div>
    </div>
  );
}
