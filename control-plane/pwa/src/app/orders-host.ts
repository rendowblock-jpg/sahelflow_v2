// W3-F3 step C(1): the OrdersHost the orders screen runs on. Pure wiring, no DOM: the app gives it the relay poll, the opener of
// the sealed copy, the vault, the outbox and the drafts. The decrypted orders live ONLY in the vault: when the vault is locked
// the host answers "loading" again, never an invented empty list, and nothing is read from storage until reload().
import type { OrdersProjection } from "../../../../src/lib/connected-platform/contracts";
import type { Locale } from "../i18n";
import type { EnqueueInput, EnqueueResult } from "../outbox/outbox";
import type { OutboxRecord } from "../outbox/state";
import type { DraftStore } from "../views/notes";
import type { OrdersHost } from "../views/orders/controller";

export type OpenedOrders = Readonly<{ data: OrdersProjection; asOf: number }>;
export type VaultLike = Readonly<{ put(key: string, value: unknown): void; get<T>(key: string): T | null }>;
export type OrdersHostDeps = Readonly<{
  now(): number; locale(): Locale; online(): boolean; pcOff(): boolean; timeZone?: string;
  /** Ask the relay for a newer sealed copy (it stores the row). May throw; the stored copy is still read afterwards. */
  fetchOrders(): Promise<void>;
  /** Open the stored sealed copy with the pinned key; null when there is none, it is too old or it does not verify. */
  openOrders(): Promise<OpenedOrders | null>;
  vault: VaultLike;
  outbox: Readonly<{ list(): Promise<readonly OutboxRecord[]>; enqueue(i: EnqueueInput): Promise<EnqueueResult> }>;
  drafts: DraftStore;
  authorityExpiresAt(): number | undefined;
  go(screen: "orders" | "order"): void;
}>;
export type OrdersHostHandle = OrdersHost & Readonly<{ notify(): void }>;
export const ORDERS_VAULT_KEY = "orders";

export function createOrdersHost(deps: OrdersHostDeps): OrdersHostHandle {
  const listeners = new Set<() => void>();
  let failed = false; let inflight: Promise<void> | null = null;
  const notify = (): void => { for (const fn of Array.from(listeners)) fn(); };
  async function load(): Promise<void> {
    failed = false; notify();
    if (deps.online()) await deps.fetchOrders().catch(() => undefined);
    const opened = await deps.openOrders().catch(() => null);
    if (opened) deps.vault.put(ORDERS_VAULT_KEY, opened); else failed = deps.vault.get<OpenedOrders>(ORDERS_VAULT_KEY) === null;
    notify();
  }
  return {
    now: deps.now, locale: deps.locale, online: deps.online, pcOff: deps.pcOff, ...(deps.timeZone ? { timeZone: deps.timeZone } : {}),
    read() {
      const v = deps.vault.get<OpenedOrders>(ORDERS_VAULT_KEY);
      if (v) return { status: "ready", data: v.data, asOf: v.asOf };
      return { status: failed ? "error" : "loading", data: null, asOf: null };
    },
    reload: () => (inflight ??= load().finally(() => { inflight = null; })),
    commands: () => deps.outbox.list(),
    // Passed on untouched: the order version rides in target.expectedVersion (confirm, reject and the note thread alike).
    async enqueue(i) { const r = await deps.outbox.enqueue(i); notify(); return r; },
    drafts: deps.drafts,
    authorityExpiresAt: deps.authorityExpiresAt,
    go: deps.go,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    notify,
  };
}
