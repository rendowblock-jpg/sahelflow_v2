import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RECENT_RECORDS_MAX,
  RECENT_RECORDS_STORAGE_KEY,
  RECENT_RECORDS_VISIBLE,
  pushRecentRecord,
  readRecentRecords,
} from "@/hooks/use-recent-records";

function stubLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
  return store;
}

function visit(id: string, label = id, kind: "order" | "customer" | "product" = "order") {
  return pushRecentRecord({
    kind,
    id,
    label,
    href: `/${kind === "order" ? "orders" : `${kind}s`}/${id}`,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("recent records journal", () => {
  it("records a visit at the front and persists it", () => {
    const store = stubLocalStorage();

    const journal = visit("order-1", "SF-1001");

    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      kind: "order",
      id: "order-1",
      label: "SF-1001",
      href: "/orders/order-1",
    });
    expect(journal[0]?.viewedAt ?? 0).toBeGreaterThan(0);
    const persisted = JSON.parse(
      store.get(RECENT_RECORDS_STORAGE_KEY) ?? "[]",
    ) as unknown[];
    expect(persisted).toHaveLength(1);
  });

  it("moves a revisited record to the front instead of duplicating it", () => {
    stubLocalStorage();
    visit("order-1", "SF-1001");
    visit("customer-2", "Amine", "customer");
    const journal = visit("order-1", "SF-1001");

    expect(journal.map((entry) => entry.id)).toEqual([
      "order-1",
      "customer-2",
    ]);
    expect(readRecentRecords()).toHaveLength(2);
  });

  it("caps the journal beyond the palette presentation cap", () => {
    stubLocalStorage();
    expect(RECENT_RECORDS_VISIBLE).toBeLessThan(RECENT_RECORDS_MAX);

    for (let index = 0; index < RECENT_RECORDS_MAX + 4; index += 1) {
      visit(`order-${index}`);
    }

    const journal = readRecentRecords();
    expect(journal).toHaveLength(RECENT_RECORDS_MAX);
    // Newest first, oldest evicted.
    expect(journal[0]?.id).toBe(`order-${RECENT_RECORDS_MAX + 3}`);
    expect(journal.at(-1)?.id).toBe("order-4");
  });

  it("degrades to an empty journal when storage is corrupt", () => {
    stubLocalStorage({ [RECENT_RECORDS_STORAGE_KEY]: "{not json" });

    expect(readRecentRecords()).toEqual([]);
    // A later visit repairs the journal instead of staying broken.
    const journal = visit("product-9", "Cairo bag", "product");
    expect(journal.map((entry) => entry.id)).toEqual(["product-9"]);
  });

  it("drops malformed entries instead of rendering garbage in the palette", () => {
    stubLocalStorage({
      [RECENT_RECORDS_STORAGE_KEY]: JSON.stringify([
        { kind: "delivery", id: "d1", label: "nope", href: "/deliveries/d1", viewedAt: 1 },
        { kind: "order", id: "", label: "no id", href: "/orders/", viewedAt: 1 },
        { kind: "customer", id: "c1", label: "Amel", href: "customers/c1", viewedAt: 1 },
        { kind: "product", id: "p1", label: "Serum", href: "/products/p1", viewedAt: "yesterday" },
        { kind: "order", id: "o1", label: "SF-2002", href: "/orders/o1", viewedAt: 5 },
      ]),
    });

    const journal = readRecentRecords();
    expect(journal.map((entry) => entry.id)).toEqual(["o1"]);
  });

  it("survives storage failures without throwing on the page visit", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota exceeded");
        },
        removeItem: () => {},
      },
    });

    expect(() => visit("order-1", "SF-1001")).not.toThrow();
    expect(readRecentRecords()).toEqual([]);
  });

  it("is a no-op outside the browser (SSR)", () => {
    // Node test environment: `window` is undefined unless stubbed.
    expect(readRecentRecords()).toEqual([]);
    const journal = pushRecentRecord({
      kind: "order",
      id: "order-ssr",
      label: "SF-3003",
      href: "/orders/order-ssr",
    });
    expect(journal).toHaveLength(1);
  });
});
