// W3-F178 phase A: the inbox mount. Loads the lazy inbox screen once, gives it a host, and feeds it ONLY from the vault.
// Structural deps (no import from app.ts): the app passes its real vault, relay.poll, opener and host factory.
// Message text exists nowhere in this file's state: lock/hide/wipe empty the vault and the next read says "no data".
import type { ConversationsProjection } from "../../../../src/lib/connected-platform/contracts";
import type { InboxHost } from "../views/inbox/controller";
import type { InboxHostDeps } from "../views/inbox/host";

export type InboxRead = InboxHostDeps["readConversations"];
export type InboxPorts = Readonly<{ read: InboxRead; reload(): Promise<void>; subscribe(fn: () => void): () => void }>;
export type OpenedConversations = Readonly<{ data: ConversationsProjection; asOf: number }>;
export type InboxMountDeps = Readonly<{
  vault: Readonly<{ get<T>(k: string): T | null; put(k: string, v: unknown): void }>;
  loadScreen(): Promise<Readonly<{ attachInboxHost(h: InboxHost): void }>>; // () => import("../views/inbox/screen")
  makeHost(p: InboxPorts): InboxHost; // createInboxHost({ outbox, drafts, go, now, locale, online, pcOff, authorityExpiresAt, readConversations: p.read, reload: p.reload, subscribeAll: p.subscribe })
  // The newest SEALED conversations projection, opened by the app's opener; asOf = when that copy arrived (row.receivedAt), like openOrders.
  openConversations(): Promise<OpenedConversations | null>;
  poll(kind: "conversations"): Promise<void>;
  subscribeAll(fn: () => void): () => void; // the app's own ticks (outbox, sync)
}>;
export const VAULT_KEY = "conversations"; export const VAULT_ASOF = "conversations.asOf";

export function createInboxMount(d: InboxMountDeps) {
  let attached = false; let loading: Promise<boolean> | null = null; let inflight: Promise<void> | null = null;
  let last: "ok" | "failed" | null = null; const mine = new Set<() => void>();
  const notify = (): void => { for (const fn of [...mine]) fn(); };

  // The only reader: the vault. Empty (never opened, locked, hidden too long, wiped) = no data, never an invented empty inbox.
  const read: InboxRead = () => {
    const data = d.vault.get<ConversationsProjection>(VAULT_KEY);
    if (data === null) return { status: last === "failed" ? "error" : "loading", data: null, asOf: null };
    return { status: "ready", data, asOf: d.vault.get<number>(VAULT_ASOF) }; // a failed reload keeps the old asOf, so the screen shows it as stale
  };
  // Poll, re-open the sealed copy, put it in the vault, tell the screen once. A failure keeps what the vault has. Never throws.
  async function run(): Promise<void> {
    try {
      await d.poll("conversations");
      const next = await d.openConversations();
      if (next === null) { last = "failed"; return; }
      d.vault.put(VAULT_KEY, next.data); d.vault.put(VAULT_ASOF, next.asOf); last = "ok"; notify();
    } catch { last = "failed"; }
  }
  const reload = (): Promise<void> => {
    if (inflight) return inflight; // two taps at once share one poll
    const p: Promise<void> = run().finally(() => { if (inflight === p) inflight = null; }); inflight = p; return p;
  };
  const subscribe = (fn: () => void): (() => void) => { mine.add(fn); const off = d.subscribeAll(fn); return () => { mine.delete(fn); off(); }; };

  // The sealed copy opens without the network: a visit after an unlock refills an empty vault before the first poll.
  async function fill(): Promise<void> {
    if (d.vault.get(VAULT_KEY) !== null) return;
    try { const p = await d.openConversations(); if (p !== null) { d.vault.put(VAULT_KEY, p.data); d.vault.put(VAULT_ASOF, p.asOf); notify(); } } catch { /* the screen keeps its skeleton */ }
  }
  async function ensureScreen(): Promise<boolean> {
    if (attached) return true;
    if (loading) return loading; // two visits at once share one load
    const p: Promise<boolean> = load().finally(() => { if (loading === p) loading = null; }); loading = p; return p;
  }
  async function load(): Promise<boolean> {
    try { const s = await d.loadScreen(); s.attachInboxHost(d.makeHost({ read, reload, subscribe })); attached = true; } catch { /* no host: the screen shows its skeleton; the next visit retries */ }
    return attached;
  }
  // Call on every visit to inbox or conversation. true = the screen has its host.
  async function visit(_screen: "inbox" | "conversation"): Promise<boolean> {
    const ok = await ensureScreen(); if (ok) await fill(); return ok;
  }
  // The app's first visit: the sealed copy first (no network); when nothing is sealed yet (a freshly paired phone) ask the relay ONCE, the way the
  // orders screen does after it attaches. visit() alone left the screen on its skeleton for good (found in the PWA lab, real Chromium).
  async function open(screen: "inbox" | "conversation"): Promise<boolean> {
    const ok = await visit(screen); if (ok && d.vault.get(VAULT_KEY) === null) await reload(); return ok;
  }
  return { visit, open, reload, read, subscribe, lastReload: (): "ok" | "failed" | null => last };
}
