// W3b F6b: the SettingsHost the settings screen runs on. Pure wiring, no DOM. It reads the open commands straight from the outbox store,
// retries one by sending the SAME sealed text again (never sealing twice), and discards only a command that was never sent.
import type { Locale } from "../i18n";
import type { OutboxRecord } from "../outbox/state";
import { isOpen } from "../outbox/state";
import type { Db } from "../storage/idb";
import type { SettingsHost } from "../views/settings/controller";
import type { SettingsRead } from "../views/settings/render";
import type { Theme } from "../views/view";

export type SettingsHostDeps = Readonly<{
  now(): number; locale(): Locale; online(): boolean; timeZone?: string; theme(): Theme; hasLock(): boolean; revoked(): boolean;
  /** The time of the sealed copy the Today numbers come from (never "now"); null before the first one. */
  projectionAt(): number | null;
  pairedAt(): Promise<number | null>;
  db(): Promise<Db>;
  flush(): Promise<void>;
  refresh(): Promise<void>;
  setLocale(l: Locale): void; setTheme(x: Theme): void; startLockSetup(): void;
  wipe(): Promise<Readonly<{ ok: boolean }>>;
}>;
export type SettingsHostHandle = SettingsHost & Readonly<{ notify(): void }>;

// Same rule as canRetry / canDiscard in views/settings/render.ts (a test pins that they agree; this file must stay out of the lazy chunk).
const retryable = (r: OutboxRecord): boolean => (r.state === "queued" || r.state === "unknown") && r.resultCode !== "ALREADY_ANSWERED";
const discardable = (r: OutboxRecord): boolean => r.state === "queued" && r.resultCode !== "ALREADY_ANSWERED";

export function createSettingsHost(deps: SettingsHostDeps): SettingsHostHandle {
  const listeners = new Set<() => void>();
  let snap: Readonly<{ pairedAt: number | null; commands: readonly OutboxRecord[] }> | null = null; let failed = false; let inflight: Promise<void> | null = null;
  const notify = (): void => { for (const fn of Array.from(listeners)) fn(); };
  async function openCommands(): Promise<OutboxRecord[]> {
    const db = await deps.db(); const out: OutboxRecord[] = [];
    for (const key of await db.keys("outbox")) { const r = await db.get<OutboxRecord>("outbox", key); if (r && typeof r.commandId === "string" && isOpen(r.state)) out.push(r); }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }
  async function load(): Promise<void> {
    failed = false;
    try { snap = { pairedAt: await deps.pairedAt().catch(() => null), commands: await openCommands() }; } catch { failed = true; }
    notify();
  }
  return {
    now: deps.now, locale: deps.locale, online: deps.online, theme: deps.theme, hasLock: deps.hasLock, ...(deps.timeZone ? { timeZone: deps.timeZone } : {}),
    read(): SettingsRead {
      if (deps.revoked()) return { status: "revoked" };
      if (snap) return { status: "ready", asOf: deps.projectionAt(), pairedAt: snap.pairedAt, commands: snap.commands };
      return { status: failed ? "error" : "loading" };
    },
    reload: () => (inflight ??= load().finally(() => { inflight = null; })),
    async retry(id) {
      const db = await deps.db(); const r = await db.get<OutboxRecord>("outbox", id);
      if (!r || !retryable(r)) return;
      if (r.state === "queued") { await db.put("outbox", id, { ...r, nextTryAt: deps.now(), lastError: null }); await deps.flush().catch(() => undefined); } else await deps.refresh().catch(() => undefined);
      await load();
    },
    async discard(id) {
      const db = await deps.db(); const r = await db.get<OutboxRecord>("outbox", id);
      if (!r || !discardable(r)) return;
      await db.remove("outbox", id); await load();
    },
    setLocale(l) { deps.setLocale(l); notify(); },
    setTheme(x) { deps.setTheme(x); notify(); },
    startLockSetup: deps.startLockSetup,
    async remove() {
      const result = await deps.wipe();
      if (result.ok) { snap = { pairedAt: null, commands: [] }; }
      notify(); return result.ok;
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    notify,
  };
}
