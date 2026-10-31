// @vitest-environment happy-dom
// W3b W196, the chain: the REAL orders screen (DOM), the REAL orders host, the REAL outbox (memory db), the REAL command-follow and
// the REAL sync engine on fake timers. Only the relay is a script. The seller taps Confirm ONCE and does nothing else.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCommandFollow } from "../src/app/command-follow";
import { createOrdersHost } from "../src/app/orders-host";
import { t } from "../src/i18n";
import { createOutbox, type OutboxDeps } from "../src/outbox/outbox";
import { isOpen } from "../src/outbox/state";
import { createVault } from "../src/storage/sealed";
import { createSync } from "../src/sync/engine";
import { createDraftStore } from "../src/views/notes";
import { attachOrdersHost, screen } from "../src/views/orders/screen";
import { NOW, memDb, proj, row } from "./orders-fixtures";

const DEVICE = "phone_pwa_0001";
const tick = async (ms: number): Promise<void> => { await vi.advanceTimersByTimeAsync(ms); };
const bind = screen.bind as unknown as (root: HTMLElement) => () => void;
let cleanup: Array<() => void> = [];
beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); vi.setSystemTime(NOW); });
afterEach(() => { for (const fn of cleanup) fn(); cleanup = []; attachOrdersHost(null); vi.useRealTimers(); });

async function start(commitOnPoll: number) {
  const st = { polls: 0, posts: 0 }; let n = 0; let lastId = "";
  const deps: OutboxDeps = {
    db: memDb(), now: () => Date.now(), deviceId: DEVICE, newId: () => { n += 1; return `id_${String(n).padStart(8, "0")}`; }, policyVersion: () => 7,
    seal: async (i) => { lastId = i.commandId; return JSON.stringify({ c: i.commandId }); },
    post: async () => { st.posts += 1; return { status: 202, body: { commandId: lastId, state: "queued", relaySequence: 5 } }; },
    status: async () => { st.polls += 1; return st.polls >= commitOnPoll ? { status: 200, body: { state: "committed", result: { env: 1 } } } : { status: 200, body: { state: "queued", result: null } }; },
    openResult: async () => ({ ok: true, deviceId: DEVICE, commandId: lastId, outcome: "committed" }),
  };
  const outbox = createOutbox(deps); const vault = createVault();
  let sync: ReturnType<typeof createSync> | null = null;
  const follow = createCommandFollow({ commandSent: () => sync?.commandSent() });
  sync = createSync({
    now: () => Date.now(), visible: () => true, online: () => true, screen: () => "orders",
    fetchKind: async () => ({ kind: "unchanged" }), loadBudget: async () => null, saveBudget: async () => undefined, onPoll: () => undefined,
    pollCommands: () => follow.polled(outbox, async () => { await outbox.flush(); await outbox.refresh(); return (await outbox.list()).some((r) => isOpen(r.state)); }),
    timers: { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) },
  });
  const host = createOrdersHost({
    now: () => Date.now(), locale: () => "en", online: () => true, pcOff: () => false, timeZone: "UTC",
    fetchOrders: async () => undefined, openOrders: async () => ({ data: proj([row()]), asOf: NOW - 60_000 }),
    vault, outbox: follow.wrap(outbox), drafts: createDraftStore(memDb(), () => Date.now()), authorityExpiresAt: () => undefined, go: () => undefined,
  });
  follow.subscribe(() => host.notify());
  attachOrdersHost(host);
  const root = document.createElement("div"); document.body.append(root); cleanup.push(() => root.remove());
  cleanup.push(bind(root)); await host.reload(); await tick(0);
  const click = async (sel: string): Promise<void> => { const el = root.querySelector<HTMLElement>(sel); expect(el, sel).not.toBeNull(); el?.click(); await tick(0); };
  await click('[data-act="open-order"]'); await click('[data-act="confirm-open"]'); await click('[data-act="confirm-yes"]');
  return { root, st, vault, follow, sync, outbox };
}

describe("W196 chain: Confirm, then nothing else", () => {
  it("the chip leaves its first word by itself: Sent after the flush, Done on your PC after the second status poll", async () => {
    const w = await start(2);
    expect(w.st.posts).toBe(1);
    // the flush ran and told the screen: no longer 'Saved on this phone', with no other user action
    expect(w.root.innerHTML).toContain('data-state="sent"'); expect(w.root.innerHTML).not.toContain('data-state="queued"');
    expect(w.root.textContent).toContain(t("en", "cmd.sent")); expect(w.root.textContent).not.toContain(t("en", "cmd.queued"));
    await tick(2000); expect(w.st.polls).toBe(1); expect(w.root.innerHTML).toContain('data-state="sent"'); // the PC has not answered yet
    await tick(4000); expect(w.st.polls).toBe(2);
    expect(w.root.innerHTML).toContain('data-state="committed"'); expect(w.root.textContent).toContain(t("en", "cmd.committed"));
    expect(w.root.textContent).not.toContain(t("en", "cmd.sent"));
    await tick(120_000); expect(w.st.polls).toBe(2); // nothing is open any more: the status poll stopped
  });
  it("lock then notify: the DOM holds no customer text", async () => {
    const w = await start(99);
    expect(w.root.textContent).toContain("Amina");
    w.vault.lock(); w.follow.notify(); await tick(0);
    for (const secret of ["Amina", "Robe", "0550123456", "Didouche"]) expect(w.root.innerHTML, secret).not.toContain(secret);
  });
});
