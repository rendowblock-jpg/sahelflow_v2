import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Calculator,
  Clock,
  DollarSign,
  LayoutDashboard,
  MessageSquare,
  Package,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Store,
  Truck,
  Upload,
  UserCircle,
  Users,
  Zap,
} from "lucide-react";

export type NavigationDomainId =
  | "home"
  | "sell"
  | "customers"
  | "fulfill"
  | "money"
  | "inbox"
  | "grow";

export interface NavigationItem {
  id: string;
  labelKey: string;
  href: string;
  icon: LucideIcon;
  keywords: readonly string[];
  /**
   * Keep an item visually subordinate only when it is genuinely part of the
   * parent workflow. Other historical `children` are promoted to visible
   * sidebar destinations while remaining in the same canonical registry.
   */
  sidebarNested?: boolean;
}

export interface NavigationDomain extends NavigationItem {
  id: NavigationDomainId;
  children?: readonly NavigationItem[];
}

function item(
  id: string,
  labelKey: string,
  href: string,
  icon: LucideIcon,
  keywords: readonly string[] = [],
  sidebarNested = false,
): NavigationItem {
  return { id, labelKey, href, icon, keywords, sidebarNested };
}

/**
 * Canonical application information architecture.
 *
 * Business-domain relationships remain available to command/search and route
 * context, but the desktop sidebar is intentionally shallow: seller destinations
 * are directly visible unless a route is genuinely subordinate to a parent job.
 */
export const navigationDomains: readonly NavigationDomain[] = [
  {
    id: "home",
    labelKey: "nav.dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    keywords: ["home", "dashboard", "attention", "today"],
  },
  {
    id: "sell",
    labelKey: "nav.orders",
    href: "/orders",
    icon: ShoppingCart,
    keywords: ["sell", "sales", "orders", "confirmation"],
    children: [
      item(
        "confirmation-queue",
        "nav.confirmationQueue",
        "/orders/confirmation-queue",
        Clock,
        ["confirm", "queue", "sla"],
        true,
      ),
      item("products", "nav.products", "/products", Package, [
        "catalog",
        "stock",
        "inventory",
      ]),
      item("imports", "nav.imports", "/imports", Upload, [
        "csv",
        "xlsx",
        "import",
        "export",
      ]),
    ],
  },
  {
    id: "customers",
    labelKey: "nav.customers",
    href: "/customers",
    icon: Users,
    keywords: ["customers", "clients", "people", "crm"],
    children: [
      item("risk", "nav.risk", "/risk", ShieldAlert, [
        "risk",
        "blacklist",
        "reputation",
      ]),
    ],
  },
  {
    id: "fulfill",
    labelKey: "nav.delivery",
    href: "/deliveries",
    icon: Truck,
    keywords: ["fulfill", "shipping", "delivery", "courier"],
    children: [
      item("returns", "nav.returns", "/returns", RotateCcw, [
        "return",
        "exchange",
        "refund",
      ]),
    ],
  },
  {
    id: "money",
    labelKey: "nav.accounting",
    href: "/accounting",
    icon: Calculator,
    keywords: ["money", "finance", "accounting", "profit"],
    children: [
      item(
        "cod-reconciliation",
        "nav.codReconciliation",
        "/accounting/cod-reconciliation",
        DollarSign,
        ["cod", "cash", "remittance", "reconcile"],
        true,
      ),
    ],
  },
  {
    id: "inbox",
    labelKey: "nav.inbox",
    href: "/inbox",
    icon: MessageSquare,
    keywords: ["inbox", "whatsapp", "messages", "conversations"],
  },
  {
    id: "grow",
    labelKey: "nav.analytics",
    href: "/analytics",
    icon: BarChart3,
    keywords: ["grow", "analytics", "insights", "performance"],
    children: [
      item("automations", "nav.automations", "/automations", Zap, [
        "automation",
        "rules",
        "workflow",
      ]),
      item("agents", "nav.agents", "/agents", Bot, [
        "ai",
        "assistant",
        "agent",
      ]),
      item("storefronts", "nav.storefronts", "/storefronts", Store, [
        "store",
        "storefront",
        "website",
      ]),
    ],
  },
] as const;

export const utilityNavigationItems: readonly NavigationItem[] = [
  item("profile", "nav.profile", "/profile", UserCircle, [
    "profile",
    "identity",
    "account",
  ]),
  item("settings", "nav.settings", "/settings", Settings, [
    "settings",
    "shops",
    "team",
    "license",
    "backup",
    "recovery",
    "integrations",
  ]),
] as const;

export function pathMatchesNavigation(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function navigationDomainForPathname(
  pathname: string,
): NavigationDomain | null {
  return (
    navigationDomains.find(
      (domain) =>
        pathMatchesNavigation(pathname, domain.href) ||
        domain.children?.some((child) =>
          pathMatchesNavigation(pathname, child.href),
        ),
    ) ?? null
  );
}

export function navigationItemForPathname(
  pathname: string,
): NavigationItem | null {
  const candidates = flattenNavigationItems()
    .filter((entry) => pathMatchesNavigation(pathname, entry.href))
    .sort((left, right) => right.href.length - left.href.length);
  return candidates[0] ?? null;
}

export function flattenNavigationItems(): NavigationItem[] {
  const output: NavigationItem[] = [];
  const seen = new Set<string>();

  for (const domain of navigationDomains) {
    for (const entry of [domain, ...(domain.children ?? [])]) {
      if (seen.has(entry.href)) continue;
      seen.add(entry.href);
      output.push(entry);
    }
  }
  for (const entry of utilityNavigationItems) {
    if (seen.has(entry.href)) continue;
    seen.add(entry.href);
    output.push(entry);
  }
  return output;
}

/**
 * Compatibility exports for remaining callers from the pre-Phase-5 shell. They
 * are derived from the canonical registry and therefore cannot become a second
 * navigation authority.
 */
export interface NavItem extends NavigationItem {
  group: "operations" | "insights" | "administration";
}

function legacyGroup(entry: NavigationItem): NavItem["group"] {
  if (utilityNavigationItems.some((item) => item.href === entry.href)) {
    return "administration";
  }
  const domain = navigationDomains.find(
    (candidate) =>
      candidate.href === entry.href ||
      candidate.children?.some((child) => child.href === entry.href),
  );
  return domain?.id === "money" || domain?.id === "grow"
    ? "insights"
    : "operations";
}

export const navItems: NavItem[] = flattenNavigationItems().map((entry) => ({
  ...entry,
  group: legacyGroup(entry),
}));

export const navGroups = [
  { id: "operations", labelKey: "nav.groupOperations" },
  { id: "insights", labelKey: "nav.groupFinanceInsights" },
  { id: "administration", labelKey: "nav.groupAdministration" },
] as const;
