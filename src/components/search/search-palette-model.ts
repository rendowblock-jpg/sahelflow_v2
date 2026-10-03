import {
  Hash,
  MessageSquare,
  Package,
  RotateCcw,
  Truck,
  Users,
} from "lucide-react";
import type * as React from "react";

import type { SearchRow } from "@/components/search/search-result-row";
import { buildCreateHref } from "@/hooks/use-create-param";
import type { RecordKind } from "@/hooks/use-universal-record-search";
import type { SearchCommandCopyKey } from "@/lib/i18n/search-command-center";
import type { UniversalSearchKind } from "@/lib/search/universal-search";

/** Result families the seller can scope the palette to (Tab cycles them). */
export type SearchScope = "all" | RecordKind | "navigation";

export const QUICK_NAV_IDS = [
  "home",
  "sell",
  "inbox",
  "products",
  "customers",
  "grow",
] as const;

export const RECORD_ICONS = {
  order: Hash,
  customer: Users,
  product: Package,
  conversation: MessageSquare,
  delivery: Truck,
  return: RotateCcw,
} as const satisfies Record<
  RecordKind,
  React.ComponentType<{ className?: string }>
>;

export const KIND_COPY: Record<UniversalSearchKind, SearchCommandCopyKey> = {
  navigation: "typePage",
  action: "typeAction",
  order: "typeOrder",
  customer: "typeCustomer",
  product: "typeProduct",
  conversation: "typeConversation",
  delivery: "typeDelivery",
  return: "typeReturn",
};

/** Plural group headings, also used as scope chip labels. */
export const GROUP_COPY: Record<Exclude<SearchScope, "all">, SearchCommandCopyKey> = {
  order: "groupOrders",
  customer: "groupCustomers",
  product: "groupProducts",
  conversation: "groupConversations",
  delivery: "groupDeliveries",
  return: "groupReturns",
  navigation: "groupPages",
};

/**
 * R4-f create actions. Navigation-only palettes force the seller back to the
 * list surface before any create flow can start (d5/d7-a); these three
 * commands deep-link straight into the surface's create dialog via
 * `?create=1`. Permissions stay server-side — each surface renders its create
 * dialog only when the actor's authority allows it, so an action without
 * permission lands on the plain list instead of a dead-end.
 */
export interface PaletteCreateAction {
  id: string;
  labelKey: SearchCommandCopyKey;
  href: string;
  keywords: readonly string[];
}

export const CREATE_ACTIONS: readonly PaletteCreateAction[] = [
  {
    id: "create-order",
    labelKey: "actionCreateOrder",
    href: buildCreateHref("/orders"),
    keywords: [
      "new order", "create order", "add order",
      "nouvelle commande", "créer commande", "ajouter commande",
      "طلب جديد", "إنشاء طلب", "إضافة طلب",
    ],
  },
  {
    id: "create-customer",
    labelKey: "actionCreateCustomer",
    href: buildCreateHref("/customers"),
    keywords: [
      "new customer", "create customer", "add customer",
      "nouveau client", "créer client", "ajouter client",
      "عميل جديد", "إنشاء عميل", "إضافة عميل",
    ],
  },
  {
    id: "create-product",
    labelKey: "actionCreateProduct",
    href: buildCreateHref("/products"),
    keywords: [
      "new product", "create product", "add product",
      "nouveau produit", "créer produit", "ajouter produit",
      "منتج جديد", "إنشاء منتج", "إضافة منتج",
    ],
  },
];

export interface ResultGroup {
  kind: Exclude<SearchScope, "all">;
  rows: Array<SearchRow & { score: number }>;
}

/** Rows shown per family in the "All" scope before "Show all" appears. */
export const GROUP_PREVIEW_LIMIT = 5;

/**
 * Group ranked rows by family. Rows keep their relevance order inside a group
 * and groups are ordered by their best row, so the family the seller is most
 * likely looking for always comes first.
 */
export function groupResults(
  rows: ReadonlyArray<SearchRow & { score: number }>,
): ResultGroup[] {
  const byKind = new Map<ResultGroup["kind"], ResultGroup>();
  for (const row of [...rows].sort((left, right) => right.score - left.score)) {
    if (row.kind === "action") continue;
    const kind = row.kind;
    let group = byKind.get(kind);
    if (!group) {
      group = { kind, rows: [] };
      byKind.set(kind, group);
    }
    group.rows.push(row);
  }
  return [...byKind.values()].sort((left, right) => {
    const leftNav = left.kind === "navigation" ? 1 : 0;
    const rightNav = right.kind === "navigation" ? 1 : 0;
    if (leftNav !== rightNav) return leftNav - rightNav;
    return (right.rows[0]?.score ?? 0) - (left.rows[0]?.score ?? 0);
  });
}
