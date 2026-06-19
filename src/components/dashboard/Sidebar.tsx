"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  Truck,
  RotateCcw,
  Wallet,
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
  Shield,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { useI18n } from "@/lib/i18n";
import { useLayout } from "@/components/providers/Providers";
import { usePermissions } from "@/hooks/usePermissions";
import { useSeller } from "@/components/providers/SellerProvider";

const navIcons = {
  dashboard: LayoutDashboard,
  orders: ShoppingCart,
  inbox: MessageCircle,
  customers: Users,
  products: Package,
  delivery: Truck,
  returns: RotateCcw,
  accounting: Wallet,
  shipping: Map,
  agents: Bot,
  automations: Zap,
  analytics: BarChart3,
  integrations: Plug,
  imports: Import,
  team: Shield,
  settings: Settings,
  risk: AlertTriangle,
};

const navGroups = [
  {
    titleKey: "groupWorkspace" as const,
    items: [
      { key: "dashboard" as const, href: "/dashboard" },
      { key: "orders" as const, href: "/dashboard/orders" },
      { key: "inbox" as const, href: "/dashboard/inbox" },
      { key: "customers" as const, href: "/dashboard/customers" },
    ],
  },
  {
    titleKey: "groupOperations" as const,
    items: [
      { key: "products" as const, href: "/dashboard/products" },
      { key: "delivery" as const, href: "/dashboard/delivery" },
      { key: "returns" as const, href: "/dashboard/returns" },
      { key: "shipping" as const, href: "/dashboard/shipping" },
    ],
  },
  {
    titleKey: "groupAiAutomation" as const,
    items: [
      { key: "agents" as const, href: "/dashboard/agents" },
      { key: "automations" as const, href: "/dashboard/automations" },
      { key: "imports" as const, href: "/dashboard/imports" },
    ],
  },
  {
    titleKey: "groupFinanceInsights" as const,
    items: [
      { key: "accounting" as const, href: "/dashboard/accounting" },
      { key: "analytics" as const, href: "/dashboard/analytics" },
    ],
  },
  {
    titleKey: "groupAdministration" as const,
    items: [
      { key: "integrations" as const, href: "/dashboard/integrations" },
      { key: "team" as const, href: "/dashboard/settings/team" },
      { key: "settings" as const, href: "/dashboard/settings" },
    ],
  },
];

const routePermissions: Record<keyof typeof navIcons, string> = {
  dashboard: "dashboard:view",
  orders: "orders:view",
  inbox: "inbox:view",
  customers: "customers:view",
  products: "products:view",
  delivery: "orders:view",
  returns: "returns:view",
  accounting: "accounting:view",
  shipping: "settings:view",
  agents: "ai:chat",
  automations: "automations:view",
  analytics: "dashboard:view",
  integrations: "settings:view",
  imports: "products:manage",
  team: "team:view",
  settings: "dashboard:view",
  risk: "dashboard:view",
};

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { isMobile, isTablet, sidebarOpen, closeSidebar } = useLayout();
  const { hasPermission, loading } = usePermissions();
  const { displayName: storeName, initials, profile } = useSeller();
  const isMobileOrTablet = isMobile || isTablet;
  const [waConnected, setWaConnected] = useState<boolean>(false);

  useEffect(() => {
    async function checkWhatsApp() {
      try {
        const res = await fetch("/api/channels/connect", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          setWaConnected(data.status === "connected");
        }
      } catch {
        // fail silently
      }
    }
    checkWhatsApp();
    const interval = setInterval(checkWhatsApp, 60000);
    return () => clearInterval(interval);
  }, []);

  const sidebarClass = `sf-sidebar ${isMobileOrTablet ? (sidebarOpen ? "mobile-open" : "") : ""}`;

  return (
    <>
      {isMobileOrTablet && sidebarOpen && (
        <div className="sf-sidebar-backdrop" onClick={closeSidebar} />
      )}

      <aside className={sidebarClass}>
        {/* Logo Row */}
        <div className="sf-sidebar-logo" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "white",
              flexShrink: 0,
              background: "var(--gradient-brand)",
              letterSpacing: "-0.02em",
            }}
          >
            S
          </div>
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              color: "var(--color-content-primary)",
              flex: 1,
            }}
          >
            SahelFlow
          </span>

          {/* WhatsApp status dot */}
          <div
            className={waConnected ? "sf-wa-status-dot sf-wa-status-dot--connected" : "sf-wa-status-dot"}
            title={waConnected ? "WhatsApp Connected" : "WhatsApp Offline"}
          />

          {isMobileOrTablet && (
            <button
              onClick={closeSidebar}
              style={{
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

        {/* Workspace Header */}
        <div className="sf-sidebar-workspace">
          <div className="sf-sidebar-workspace-avatar">
            {initials || "S"}
          </div>
          <span className="sf-sidebar-workspace-name">
            {storeName || t.common.myStore}
          </span>
          {profile?.plan && <div className="sf-sidebar-workspace-badge">{profile.plan === "free" ? "Free" : profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)}</div>}
          <ChevronDown size={12} style={{ color: "var(--color-content-tertiary)", flexShrink: 0 }} />
        </div>

        {/* Navigation */}
        <nav className="sf-sidebar-nav" style={{ padding: "12px 8px", gap: "16px" }}>
          {!loading && navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => {
              const permission = routePermissions[item.key];
              return hasPermission(permission);
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.titleKey} className="sf-nav-group" style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <span
                  className="sf-nav-group-title"
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: "var(--color-content-tertiary)",
                    padding: "0 10px",
                    marginBottom: "4px",
                    opacity: 0.5,
                  }}
                >
                  {t.nav[group.titleKey]}
                </span>
                {visibleItems.map((item) => {
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
                      <Icon
                        size={16}
                        strokeWidth={isActive ? 2.2 : 1.8}
                        style={{
                          flexShrink: 0,
                          opacity: isActive ? 1 : 0.6,
                          transition: "opacity 0.1s ease",
                        }}
                      />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
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
              color: "var(--color-content-tertiary)",
            }}
          >
            <LogOut
              size={16}
              strokeWidth={1.8}
              style={{ flexShrink: 0, opacity: 0.6 }}
            />
            <span>{t.nav.logOut}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
