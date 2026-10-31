import { describe, expect, it } from "vitest";

import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import {
  flattenNavigationItems,
  flattenNavigationItemsInVisibleOrder,
  navigationItemAllowed,
  sellerSidebarNavigationItems,
  sidebarNavigationGroups,
  sidebarVisibleOrder,
  utilityNavigationItems,
  visibleSidebarNavigationGroups,
  type NavigationItem,
  type SidebarNavigationGroup,
} from "../navigation";
import {
  NAV_GROUPS_STORAGE_KEY,
  parseCollapsedGroups,
  readCollapsedGroups,
  serializeCollapsedGroups,
  toggleCollapsedGroup,
  writeCollapsedGroups,
} from "../sidebar-group-state";

const EXPECTED = [
  ["today", "nav.groupToday", false, ["home", "confirmation-queue", "inbox"]],
  ["sales", "nav.groupSales", true, ["sell", "products", "customers", "risk", "storefront"]],
  ["delivery", "nav.groupDelivery", true, ["fulfill", "returns"]],
  ["money", "nav.groupMoney", true, ["grow", "money", "cod-reconciliation"]],
  ["automation", "nav.groupAutomation", true, ["automations", "agents"]],
  ["footer", null, false, ["imports", "settings"]],
] as const;

const FLAT_ORDER = [...sellerSidebarNavigationItems, ...utilityNavigationItems].map((item) => item.id);

describe("sidebar groups: the visible structure", () => {
  it.each(EXPECTED)("group %s has label %s, collapsible=%s and the expected items", (id, labelKey, collapsible, ids) => {
    const group = sidebarNavigationGroups.find((entry) => entry.id === id);
    expect(group).toBeDefined();
    expect(group?.labelKey).toBe(labelKey);
    expect(group?.collapsible).toBe(collapsible);
    expect(group?.items.map((entry) => entry.id)).toEqual(ids);
  });

  it("lists the groups in the seller's day order", () => {
    expect(sidebarNavigationGroups.map((group) => group.id)).toEqual(EXPECTED.map((row) => row[0]));
  });

  it("holds every destination exactly once (16 seller items + Settings)", () => {
    const ids = sidebarNavigationGroups.flatMap((group) => group.items.map((entry) => entry.id));
    expect(ids).toHaveLength(17);
    expect(new Set(ids).size).toBe(17);
    expect([...ids].sort()).toEqual([...FLAT_ORDER].sort());
  });

  it("keeps the existing order inside each group", () => {
    for (const group of sidebarNavigationGroups) {
      const positions = group.items.map((entry) => FLAT_ORDER.indexOf(entry.id));
      expect(positions, group.id).toEqual([...positions].sort((a, b) => a - b));
    }
  });

  it("never makes Today or the footer collapsible, and the footer has no header", () => {
    expect(sidebarNavigationGroups.find((group) => group.id === "today")?.collapsible).toBe(false);
    const footer = sidebarNavigationGroups.find((group) => group.id === "footer");
    expect(footer?.collapsible).toBe(false);
    expect(footer?.labelKey).toBeNull();
  });
});

describe("sidebar groups: access", () => {
  const source = sellerSidebarNavigationItems.find((entry) => entry.id === "imports");
  if (!source) throw new Error("imports is missing from the seller list");
  const open: NavigationItem = { id: "open", labelKey: source.labelKey, href: "/open", icon: source.icon, keywords: [] };
  const gated: NavigationItem = { ...source, id: "gated", requiredActions: ["data.import"] };
  const synthetic: readonly SidebarNavigationGroup[] = [
    { id: "today", labelKey: "nav.groupToday", collapsible: false, items: [open] },
    { id: "automation", labelKey: "nav.groupAutomation", collapsible: true, items: [gated] },
    { id: "footer", labelKey: null, collapsible: false, items: [gated] },
  ];

  it("has fixtures: one item open to everyone and one that needs an action", () => {
    expect(navigationItemAllowed(open, [])).toBe(true);
    expect(navigationItemAllowed(gated, [])).toBe(false);
    expect(navigationItemAllowed(gated, ["data.import"])).toBe(true);
  });

  it("drops a group (and so its header) when the member can open nothing in it", () => {
    expect(visibleSidebarNavigationGroups([], synthetic).map((group) => group.id)).toEqual(["today"]);
    expect(visibleSidebarNavigationGroups(null, synthetic).map((group) => group.id)).toEqual(["today", "automation", "footer"]);
    expect(visibleSidebarNavigationGroups(["data.import"], synthetic).map((group) => group.id)).toEqual(["today", "automation", "footer"]);
  });

  it("filters items inside a kept group without touching the registry", () => {
    const mixed: readonly SidebarNavigationGroup[] = [{ id: "sales", labelKey: "nav.groupSales", collapsible: true, items: [open, gated] }];
    expect(visibleSidebarNavigationGroups([], mixed)[0]?.items.map((entry) => entry.id)).toEqual(["open"]);
    expect(mixed[0]?.items).toHaveLength(2);
  });

  it("never returns an empty group or a forbidden item for the real groups", () => {
    for (const permissions of [null, [], ["data.import"]] as const) {
      for (const group of visibleSidebarNavigationGroups(permissions)) {
        expect(group.items.length, group.id).toBeGreaterThan(0);
        for (const entry of group.items) expect(navigationItemAllowed(entry, permissions), entry.id).toBe(true);
      }
    }
  });

  it("orders the palette and the keyboard like the sidebar, without losing a destination", () => {
    const visible = sidebarVisibleOrder(null).map((entry) => entry.href);
    const palette = flattenNavigationItemsInVisibleOrder().map((entry) => entry.href);
    expect(palette.slice(0, visible.length)).toEqual(visible);
    expect([...palette].sort()).toEqual(flattenNavigationItems().map((entry) => entry.href).sort());
  });
});

describe("sidebar groups: labels", () => {
  it.each([
    ["ar", ["اليوم", "البيع", "التسليم", "المال", "الأتمتة"]],
    ["fr", ["Aujourd'hui", "Ventes", "Livraison", "Argent", "Automatisation"]],
    ["en", ["Today", "Sales", "Delivery", "Money", "Automation"]],
  ] as const)("has the %s group labels in the runtime catalog", (locale, labels) => {
    const keys = ["nav.groupToday", "nav.groupSales", "nav.groupDelivery", "nav.groupMoney", "nav.groupAutomation"];
    expect(keys.map((key) => getRuntimeTranslation(locale, key))).toEqual(labels);
  });
});

describe("sidebar groups: remembered collapse state", () => {
  it("has the agreed storage key", () => {
    expect(NAV_GROUPS_STORAGE_KEY).toBe("sahelflow-nav-groups-v1");
  });

  it.each([
    ["null", null, []],
    ["undefined", undefined, []],
    ["empty string", "", []],
    ["corrupt JSON", "{not json", []],
    ["a bare array", '["sales"]', []],
    ["a string", '"sales"', []],
    ["wrong shape", '{"collapsed":"sales"}', []],
    ["null collapsed", '{"collapsed":null}', []],
    ["valid", '{"collapsed":["money","delivery"]}', ["delivery", "money"]],
    ["never Today or the footer", '{"collapsed":["today","footer","sales"]}', ["sales"]],
    ["drops unknown ids, numbers and duplicates", '{"collapsed":["sales","nope",7,null,"sales"]}', ["sales"]],
  ])("parses %s", (_name, raw, expected) => {
    expect([...parseCollapsedGroups(raw)].sort()).toEqual(expected);
  });

  it("serialises in the canonical group order and round-trips", () => {
    expect(serializeCollapsedGroups(new Set(["money", "sales"] as const))).toBe('{"collapsed":["sales","money"]}');
    expect(serializeCollapsedGroups(new Set())).toBe('{"collapsed":[]}');
    const round = parseCollapsedGroups(serializeCollapsedGroups(new Set(["automation", "delivery"] as const)));
    expect([...round].sort()).toEqual(["automation", "delivery"]);
  });

  it("toggles only collapsible groups and returns a new set", () => {
    const start = new Set<"sales">();
    const opened = toggleCollapsedGroup(start, "sales");
    expect([...opened]).toEqual(["sales"]);
    expect(start.size).toBe(0);
    expect(toggleCollapsedGroup(opened, "sales").size).toBe(0);
    expect(toggleCollapsedGroup(new Set(), "today").size).toBe(0);
    expect(toggleCollapsedGroup(new Set(), "footer").size).toBe(0);
  });

  it("tolerates a missing, blocked or failing storage", () => {
    expect(readCollapsedGroups(null).size).toBe(0);
    expect(readCollapsedGroups({ getItem: () => { throw new Error("blocked"); } }).size).toBe(0);
    expect([...readCollapsedGroups({ getItem: () => '{"collapsed":["sales"]}' })]).toEqual(["sales"]);
    expect(writeCollapsedGroups(null, new Set())).toBe(false);
    expect(writeCollapsedGroups({ setItem: () => { throw new Error("quota"); } }, new Set(["sales"] as const))).toBe(false);
    const written: string[] = [];
    expect(writeCollapsedGroups({ setItem: (key, value) => { written.push(key, value); } }, new Set(["sales"] as const))).toBe(true);
    expect(written).toEqual(["sahelflow-nav-groups-v1", '{"collapsed":["sales"]}']);
  });
});
