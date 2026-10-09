import type { LucideIcon } from "lucide-react";

import type { Phase2Action } from "@/lib/identity/permissions";
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
  | "storefront"
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
  /**
   * Marks the destination as carrying a live unread signal (the WhatsApp
   * inbox). The sidebar renders an unread badge on this item from the shared
   * unread-summary poll; the registry stays the single authority for which
   * route is live.
   */
  unreadBadge?: boolean;
  /**
   * The page enforces these on the server; the sidebar and command palette
   * only hide a destination the member could not open. Any one suffices.
   */
  requiredActions?: readonly Phase2Action[];
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
  requiredActions?: readonly Phase2Action[],
): NavigationItem {
  return { id, labelKey, href, icon, keywords, sidebarNested, requiredActions };
}

/**
 * Canonical application information architecture.
 *
 * Domain ownership remains stable for route context, command/search and
 * permissions. The visible sidebar order is defined separately below so seller
 * frequency/priority does not distort those semantic relationships.
 */
export const navigationDomains: readonly NavigationDomain[] = [
  {
    id: "home",
    labelKey: "nav.dashboard",
    href: "/dashboard",
    requiredActions: ["shops.read"],
    icon: LayoutDashboard,
    keywords: ["home", "dashboard", "attention", "today"],
  },
  {
    id: "sell",
    labelKey: "nav.orders",
    href: "/orders",
    requiredActions: ["orders.read"],
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
        ["orders.read"],
      ),
      item(
        "products",
        "nav.products",
        "/products",
        Package,
        ["catalog", "stock", "inventory"],
        false,
        ["products.read"],
      ),
      item(
        "imports",
        "nav.imports",
        "/imports",
        Upload,
        ["csv", "xlsx", "import", "export"],
        false,
        ["data.import", "data.export"],
      ),
    ],
  },
  {
    id: "customers",
    labelKey: "nav.customers",
    href: "/customers",
    requiredActions: ["customers.read"],
    icon: Users,
    keywords: ["customers", "clients", "people", "crm"],
    children: [
      item(
        "risk",
        "nav.risk",
        "/risk",
        ShieldAlert,
        ["risk", "blacklist", "reputation"],
        false,
        ["risk.read"],
      ),
    ],
  },
  {
    id: "fulfill",
    labelKey: "nav.delivery",
    href: "/deliveries",
    requiredActions: ["deliveries.read"],
    icon: Truck,
    keywords: ["fulfill", "shipping", "delivery", "courier"],
    children: [
      item(
        "returns",
        "nav.returns",
        "/returns",
        RotateCcw,
        ["return", "exchange", "refund"],
        false,
        ["orders.read"],
      ),
    ],
  },
  {
    id: "money",
    labelKey: "nav.accounting",
    href: "/accounting",
    requiredActions: ["accounting.read"],
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
        ["accounting.read"],
      ),
    ],
  },
  {
    id: "inbox",
    labelKey: "nav.inbox",
    href: "/inbox",
    requiredActions: ["conversations.read"],
    icon: MessageSquare,
    keywords: ["inbox", "whatsapp", "messages", "conversations"],
    unreadBadge: true,
  },
  {
    id: "storefront",
    labelKey: "nav.storefrontBuilder",
    href: "/storefronts",
    requiredActions: ["storefront.read"],
    icon: Store,
    keywords: [
      "storefront",
      "storefront builder",
      "store",
      "website",
      "catalog",
      "checkout",
    ],
  },
  {
    id: "grow",
    labelKey: "nav.analytics",
    href: "/analytics",
    requiredActions: ["analytics.read"],
    icon: BarChart3,
    keywords: ["grow", "analytics", "insights", "performance"],
    children: [
      item(
        "automations",
        "nav.automations",
        "/automations",
        Zap,
        ["automation", "rules", "workflow"],
        false,
        ["automations.read"],
      ),
      item(
        "agents",
        "nav.agents",
        "/agents",
        Bot,
        ["ai", "assistant", "agent"],
        false,
        ["ai.use"],
      ),
    ],
  },
] as const;

function navigationItemById(id: string): NavigationItem {
  for (const domain of navigationDomains) {
    if (domain.id === id) return domain;
    const child = domain.children?.find((candidate) => candidate.id === id);
    if (child) return child;
  }
  throw new Error(`Unknown canonical navigation item: ${id}`);
}

/**
 * Stable seller-first sidebar sequence.
 *
 * SahelFlow owns this hierarchy instead of making each seller design the product
 * navigation. It prioritizes daily operations and moves Analytics into the
 * regular decision loop, while occasional Import/Export work stays near the end.
 * Genuine child jobs keep their visual nesting without hiding any destination.
 */
export const sellerSidebarNavigationItems: readonly NavigationItem[] = [
  navigationItemById("home"),
  navigationItemById("sell"),
  navigationItemById("confirmation-queue"),
  navigationItemById("inbox"),
  navigationItemById("products"),
  navigationItemById("customers"),
  navigationItemById("fulfill"),
  navigationItemById("returns"),
  navigationItemById("grow"),
  navigationItemById("money"),
  navigationItemById("cod-reconciliation"),
  navigationItemById("risk"),
  navigationItemById("storefront"),
  navigationItemById("automations"),
  navigationItemById("agents"),
  navigationItemById("imports"),
] as const;

/** Profile is now an Account/Profile section inside Settings, not primary nav. */
export const utilityNavigationItems: readonly NavigationItem[] = [
  item("settings", "nav.settings", "/settings", Settings, [
    "settings",
    "profile",
    "identity",
    "account",
    "shops",
    "team",
    "license",
    "backup",
    "recovery",
    "integrations",
  ]),
] as const;

/** Whether a member holding `permissions` may open this destination. */
export function navigationItemAllowed(
  entry: NavigationItem,
  permissions: readonly Phase2Action[] | null,
): boolean {
  if (permissions === null || !entry.requiredActions?.length) return true;
  return entry.requiredActions.some((action) => permissions.includes(action));
}

export function pathMatchesNavigation(pathname: string, href: string): boolean {
  if (href === "/settings" && pathname === "/profile") return true;
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
