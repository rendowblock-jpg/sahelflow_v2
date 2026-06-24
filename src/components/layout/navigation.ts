/**
 * Navigation configuration — single source of truth for sidebar items.
 * Icons are Lucide React icon names (imported in the sidebar component).
 */
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  MessageSquare,
  ShoppingCart,
  Users,
  Package,
  Truck,
  BarChart3,
  Calculator,
  RotateCcw,
  Bot,
  Settings,
  Upload,
  Store,
  UserCircle,
} from "lucide-react";

export interface NavItem {
  /** i18n key for the label */
  labelKey: string;
  /** Route path */
  href: string;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Whether this item is in the primary group (vs secondary) */
  group: "operations" | "insights" | "administration";
}

export const navItems: NavItem[] = [
  // Operations (primary — daily use)
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, group: "operations" },
  { labelKey: "nav.inbox", href: "/inbox", icon: MessageSquare, group: "operations" },
  { labelKey: "nav.orders", href: "/orders", icon: ShoppingCart, group: "operations" },
  { labelKey: "nav.customers", href: "/customers", icon: Users, group: "operations" },
  { labelKey: "nav.products", href: "/products", icon: Package, group: "operations" },
  { labelKey: "nav.delivery", href: "/deliveries", icon: Truck, group: "operations" },
  { labelKey: "nav.returns", href: "/returns", icon: RotateCcw, group: "operations" },

  // Insights (secondary — periodic review)
  { labelKey: "nav.analytics", href: "/analytics", icon: BarChart3, group: "insights" },
  { labelKey: "nav.accounting", href: "/accounting", icon: Calculator, group: "insights" },

  // Administration
  { labelKey: "nav.agents", href: "/agents", icon: Bot, group: "administration" },
  { labelKey: "nav.automations", href: "/automations", icon: Bot, group: "administration" },
  { labelKey: "nav.storefronts", href: "/storefronts", icon: Store, group: "administration" },
  { labelKey: "nav.imports", href: "/imports", icon: Upload, group: "administration" },
  { labelKey: "nav.profile", href: "/profile", icon: UserCircle, group: "administration" },
  { labelKey: "nav.settings", href: "/settings", icon: Settings, group: "administration" },
];

export const navGroups = [
  { id: "operations", labelKey: "nav.groupOperations" },
  { id: "insights", labelKey: "nav.groupFinanceInsights" },
  { id: "administration", labelKey: "nav.groupAdministration" },
] as const;
