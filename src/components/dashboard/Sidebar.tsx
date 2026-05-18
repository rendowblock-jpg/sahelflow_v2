"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Truck,
  BarChart3,
  LogOut,
  Bot,
  Settings,
  X,
  Map,
  Plug,
  MessageCircle,
  Zap,
  Import,
} from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";

const navIcons = {
  dashboard: LayoutDashboard,
  orders: ShoppingCart,
  inbox: MessageCircle,
  customers: Users,
  products: Package,
  delivery: Truck,
  shipping: Map,
  agents: Bot,
  automations: Zap,
  analytics: BarChart3,
  integrations: Plug,
  imports: Import,
  settings: Settings,
};

const navRoutes: { key: keyof typeof navIcons; href: string }[] = [
  { key: "dashboard", href: "/dashboard" },
  { key: "orders", href: "/dashboard/orders" },
  { key: "inbox", href: "/dashboard/inbox" },
  { key: "customers", href: "/dashboard/customers" },
  { key: "products", href: "/dashboard/products" },
  { key: "delivery", href: "/dashboard/delivery" },
  { key: "shipping", href: "/dashboard/shipping" },
  { key: "agents", href: "/dashboard/agents" },
  { key: "automations", href: "/dashboard/automations" },
  { key: "analytics", href: "/dashboard/analytics" },
  { key: "integrations", href: "/dashboard/integrations" },
  { key: "imports", href: "/dashboard/imports" },
  { key: "settings", href: "/dashboard/settings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { isMobile, isTablet, sidebarOpen, closeSidebar } = useLayout();
  const isMobileOrTablet = isMobile || isTablet;

  // Compact (icon-only) mode is not yet implemented; kept as explicit false so
  // the collapsed CSS class is never applied and the sidebar always shows labels.
  const sidebarClass = `sf-sidebar ${isMobileOrTablet ? (sidebarOpen ? "mobile-open" : "") : ""}`;

  return (
    <>
      {isMobileOrTablet && sidebarOpen && (
        <div className="sf-sidebar-backdrop" onClick={closeSidebar} />
      )}

      <aside className={sidebarClass}>
        {/* Logo — 32px, 6px radius, weight 600 (Linear standard) */}
        <div className="sf-sidebar-logo">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "white",
              flexShrink: 0,
              background: "var(--color-brand-500)",
              letterSpacing: "-0.02em",
            }}
          >
            S
          </div>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.03em",
              color: "var(--color-content-primary)",
            }}
          >
            SahelFlow
          </span>
          {isMobileOrTablet && (
            <button
              onClick={closeSidebar}
              style={{
                marginInlineStart: "auto",
                background: "none",
                border: "none",
                color: "var(--color-content-tertiary)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="sf-sidebar-nav">
          {navRoutes.map((item) => {
            const Icon = navIcons[item.key];
            const label = t.nav[item.key];
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.key}
                href={item.href}
                className={`sf-nav-link ${isActive ? "active" : ""}`}
                onClick={() => {
                  if (isMobileOrTablet) closeSidebar();
                }}
              >
                {/* Icons: 18px (Linear standard), white when active */}
                <Icon
                  size={18}
                  strokeWidth={isActive ? 2 : 1.75}
                  style={{
                    flexShrink: 0,
                    opacity: isActive ? 1 : 0.65,
                  }}
                />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sf-sidebar-footer">
          <button
            onClick={() => signOut()}
            className="sf-nav-link"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <LogOut
              size={18}
              strokeWidth={1.75}
              style={{ flexShrink: 0, opacity: 0.65 }}
            />
            <span>{t.nav.logOut}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
