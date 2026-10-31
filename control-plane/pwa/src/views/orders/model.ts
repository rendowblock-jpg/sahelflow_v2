// W3-F4: what the orders screens know, and the rules that depend only on it (pure: no DOM, no clock, no storage).
import { FRESH_MS, STALE_MS, type OrderProjectionRow, type OrdersProjection } from "../../../../../src/lib/connected-platform/contracts";
import { t, type Locale } from "../../i18n";
import { isOpen, type OutboxRecord } from "../../outbox/state";
import type { NotesError } from "../notes";

export type OrderFilter = "confirm" | "today" | "all";
export const FILTERS: readonly OrderFilter[] = ["confirm", "today", "all"];
export const isFilter = (v: unknown): v is OrderFilter => typeof v === "string" && (FILTERS as readonly string[]).includes(v);
export type Freshness = "fresh" | "stale" | "expired" | "pcoff" | "offline" | "none";
export type ReadStatus = "loading" | "error" | "ready";
export type OrdersModel = Readonly<{
  locale: Locale; now: number; online: boolean; pcOff: boolean; timeZone?: string;
  read: ReadStatus; data: OrdersProjection | null; asOf: number | null;
  commands: readonly OutboxRecord[];
  filter: OrderFilter; openId: string | null; openedVersion: number | null; sheet: "confirm" | "reject" | null;
  draft: string; noteError: NotesError | null; notice: "busy" | "failed" | null; authorityExpiresAt?: number;
}>;

export const isPending = (o: Readonly<{ status: string }>): boolean => o.status === "pending";

// Age of the copy: 15 min is still fresh, 24 h is still usable; one millisecond more is not (the same edges as purgeOld).
export function freshnessOf(i: Readonly<{ now: number; asOf: number | null; online: boolean; pcOff: boolean }>): Freshness {
  if (i.asOf === null) return "none";
  const age = i.now - i.asOf;
  if (age > STALE_MS) return "expired";
  if (!i.online) return "offline";
  if (i.pcOff) return "pcoff";
  return age > FRESH_MS ? "stale" : "fresh";
}
// Expired data is read-only: no decision is taken on a copy older than 24 hours.
export const canAct = (m: Pick<OrdersModel, "now" | "asOf" | "online" | "pcOff">): boolean => { const f = freshnessOf(m); return f !== "expired" && f !== "none"; };

const dayOf = (ms: number, tz?: string): string => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", ...(tz ? { timeZone: tz } : {}) }).format(ms);
export function filterOrders(m: Pick<OrdersModel, "data" | "filter" | "now" | "timeZone">): readonly OrderProjectionRow[] {
  const all = m.data?.orders ?? [];
  if (m.filter === "all") return all;
  if (m.filter === "confirm") return all.filter(isPending);
  const today = dayOf(m.now, m.timeZone);
  return all.filter((o) => { const at = Date.parse(o.createdAt); return Number.isFinite(at) && dayOf(at, m.timeZone) === today; });
}

export function ageLabel(iso: string, now: number, locale: Locale): string {
  const at = Date.parse(iso); if (!Number.isFinite(at)) return "";
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return t(locale, "orders.age.now");
  if (min < 60) return t(locale, "orders.age.m", { n: min });
  const h = Math.floor(min / 60);
  return h < 24 ? t(locale, "orders.age.h", { n: h }) : t(locale, "orders.age.d", { n: Math.floor(h / 24) });
}
// A status the phone has no word for is shown as the PC sent it, never hidden or guessed.
export function statusLabel(locale: Locale, status: string): string { const k = `orders.status.${status}`; const v = t(locale, k); return v === k ? status : v; }

const DECISIONS: readonly string[] = ["command.orders.confirm", "command.orders.reject"];
export function commandsFor(m: Pick<OrdersModel, "commands">, orderId: string): readonly OutboxRecord[] {
  return m.commands.filter((r) => r.target.type === "order" && r.target.id === orderId && DECISIONS.includes(r.kind)).sort((a, b) => a.createdAt - b.createdAt);
}
export const openCommandFor = (m: Pick<OrdersModel, "commands">, orderId: string): OutboxRecord | undefined => commandsFor(m, orderId).find((r) => isOpen(r.state));
export function latestCommandFor(m: Pick<OrdersModel, "commands">, orderId: string): OutboxRecord | undefined { const l = commandsFor(m, orderId); return l[l.length - 1]; }
// In the list a chip stays while a command is open, when it needs attention, or while the projection has not caught up with a committed one.
export function listChip(m: Pick<OrdersModel, "commands">, o: OrderProjectionRow): OutboxRecord | undefined {
  const open = openCommandFor(m, o.id); if (open) return open;
  const last = latestCommandFor(m, o.id); if (!last) return undefined;
  return last.state === "committed" && !isPending(o) ? undefined : last;
}
export const changedSinceOpened = (m: Pick<OrdersModel, "openedVersion">, o: OrderProjectionRow): boolean => m.openedVersion !== null && m.openedVersion !== o.version;
