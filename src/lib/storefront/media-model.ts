import type { StorefrontMediaItem, StorefrontMediaSet } from "./presentation-types";

function ordered(items: StorefrontMediaItem[]): StorefrontMediaItem[] {
  return items.map((item, position) => ({ ...item, position }));
}

export function emptyStorefrontMediaSet(): StorefrontMediaSet {
  return { items: [], coverMediaId: null };
}

export function attachStorefrontMedia(
  set: StorefrontMediaSet,
  item: Pick<StorefrontMediaItem, "id" | "url" | "alt">,
): StorefrontMediaSet {
  if (set.items.length >= 8) throw new Error("A storefront media set supports up to 8 items");
  const parsed = new URL(item.url);
  if (parsed.protocol !== "https:") throw new Error("Storefront media must use HTTPS");
  const items = ordered([...set.items, { ...item, position: set.items.length }]);
  return { items, coverMediaId: set.coverMediaId ?? item.id };
}

export function updateStorefrontMedia(
  set: StorefrontMediaSet,
  id: string,
  patch: Partial<Pick<StorefrontMediaItem, "url" | "alt">>,
): StorefrontMediaSet {
  return {
    ...set,
    items: set.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  };
}

export function removeStorefrontMedia(set: StorefrontMediaSet, id: string): StorefrontMediaSet {
  const items = ordered(set.items.filter((item) => item.id !== id));
  const coverMediaId = set.coverMediaId === id ? items[0]?.id ?? null : set.coverMediaId;
  return { items, coverMediaId };
}

export function reorderStorefrontMedia(set: StorefrontMediaSet, id: string, target: number): StorefrontMediaSet {
  const source = set.items.findIndex((item) => item.id === id);
  if (source < 0 || target < 0 || target >= set.items.length || source === target) return set;
  const items = [...set.items];
  const [item] = items.splice(source, 1);
  if (!item) return set;
  items.splice(target, 0, item);
  return { ...set, items: ordered(items) };
}

export function setStorefrontCoverMedia(set: StorefrontMediaSet, id: string): StorefrontMediaSet {
  return set.items.some((item) => item.id === id) ? { ...set, coverMediaId: id } : set;
}
