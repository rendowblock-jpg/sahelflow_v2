import { sidebarNavigationGroups, type SidebarGroupId } from "./navigation";

/** One key per browser (not per shop): the choice is about the screen, not the data. */
export const NAV_GROUPS_STORAGE_KEY = "sahelflow-nav-groups-v1";

const COLLAPSIBLE: readonly SidebarGroupId[] = sidebarNavigationGroups
  .filter((group) => group.collapsible)
  .map((group) => group.id);

/** Corrupt JSON, a wrong shape, unknown ids, Today and the footer are all ignored: the sidebar then starts open. */
export function parseCollapsedGroups(raw: string | null | undefined): ReadonlySet<SidebarGroupId> {
  if (!raw) return new Set();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return new Set();
  const list = (parsed as { collapsed?: unknown }).collapsed;
  if (!Array.isArray(list)) return new Set();
  return new Set(COLLAPSIBLE.filter((id) => list.includes(id)));
}

export function serializeCollapsedGroups(groups: ReadonlySet<SidebarGroupId>): string {
  return JSON.stringify({ collapsed: COLLAPSIBLE.filter((id) => groups.has(id)) });
}

/** A new set; groups that cannot collapse (Today, footer) are left as they are. */
export function toggleCollapsedGroup(groups: ReadonlySet<SidebarGroupId>, id: SidebarGroupId): ReadonlySet<SidebarGroupId> {
  const next = new Set(groups);
  if (!COLLAPSIBLE.includes(id)) return next;
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function readCollapsedGroups(storage: Pick<Storage, "getItem"> | null | undefined): ReadonlySet<SidebarGroupId> {
  if (!storage) return new Set();
  try {
    return parseCollapsedGroups(storage.getItem(NAV_GROUPS_STORAGE_KEY));
  } catch {
    return new Set();
  }
}

/** False when storage is missing, blocked or full; the caller keeps the in-memory state either way. */
export function writeCollapsedGroups(storage: Pick<Storage, "setItem"> | null | undefined, groups: ReadonlySet<SidebarGroupId>): boolean {
  if (!storage) return false;
  try {
    storage.setItem(NAV_GROUPS_STORAGE_KEY, serializeCollapsedGroups(groups));
    return true;
  } catch {
    return false;
  }
}

/** window.localStorage, or null when the browser blocks even reading the property. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/* Store for useSyncExternalStore: the raw saved string is the snapshot, so React compares it by value. */
const listeners = new Set<() => void>();
let memoryRaw: string | null = null;

export function subscribeCollapsedGroups(onChange: () => void): () => void {
  listeners.add(onChange);
  if (typeof window !== "undefined") window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    if (typeof window !== "undefined") window.removeEventListener("storage", onChange);
  };
}

/** What storage holds; only when storage cannot be read at all does the in-memory copy stand in. */
export function getCollapsedSnapshot(): string | null {
  const storage = browserStorage();
  if (!storage) return memoryRaw;
  try {
    return storage.getItem(NAV_GROUPS_STORAGE_KEY);
  } catch {
    return memoryRaw;
  }
}

export function saveCollapsedGroups(groups: ReadonlySet<SidebarGroupId>): void {
  memoryRaw = serializeCollapsedGroups(groups);
  writeCollapsedGroups(browserStorage(), groups);
  for (const listener of listeners) listener();
}
