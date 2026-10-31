// W3-F178 phase A: after lock, nothing the mount returns and nothing the real inbox controller draws holds a message. Real createVault.
import { describe, expect, it } from "vitest";
import { createInboxMount } from "../src/app/inbox-mount";
import { createVault } from "../src/storage/sealed";
import { createInboxController } from "../src/views/inbox/controller";
import { createInboxHost, type InboxHostDeps } from "../src/views/inbox/host";
import { createDraftStore } from "../src/views/notes";
import { NOW, conv, memDb, proj } from "./inbox-fixtures";

const P = proj([conv({ id: "c1" })]);
const SECRETS = ["Et la taille M ?", "Oui, elle est là", "Bonjour, la robe est disponible ?", "Amina B.", "0550123456"];
const leaks = (v: unknown): string[] => { const s = typeof v === "string" ? v : JSON.stringify(v) ?? ""; return SECRETS.filter((x) => s.includes(x)); };
function rig() {
  const vault = createVault(); vault.put("conversations", P); vault.put("conversations.asOf", NOW - 60_000);
  const mount = createInboxMount({ vault, loadScreen: async () => ({ attachInboxHost: () => undefined }), makeHost: () => ({} as never), openConversations: async () => null, poll: async () => undefined, subscribeAll: () => () => undefined });
  const hostFor = (readConversations: InboxHostDeps["readConversations"]) => createInboxHost({
    outbox: { list: async () => [], enqueue: async () => ({ ok: false, reason: "failed" }) as never }, readConversations, reload: async () => undefined,
    drafts: createDraftStore(memDb(), () => NOW), subscribeAll: () => () => undefined, go: () => undefined,
    now: () => NOW, locale: () => "en", online: () => true, pcOff: () => false, authorityExpiresAt: () => NOW + 3_600_000,
  });
  return { vault, mount, hostFor };
}

describe("the mount reads only the vault", () => {
  it("gives ready + data + asOf while the vault holds the copy", () => {
    const r = rig(); expect(r.mount.read()).toEqual({ status: "ready", data: P, asOf: NOW - 60_000 });
  });
  it("after lock: no data, no asOf, no message text anywhere in what it returns", () => {
    const r = rig(); expect(leaks(r.mount.read()).length).toBeGreaterThan(2); r.vault.lock(); // sanity first: before the lock the copy is there
    expect(r.mount.read()).toEqual({ status: "loading", data: null, asOf: null }); expect(leaks(r.mount)).toEqual([]);
  });
  it("hidden for 5 minutes drops it too; hidden for 1 minute does not", () => {
    const r = rig(); r.vault.hide(1000); r.vault.show(61_000); expect(r.mount.read().data).toBe(P);
    r.vault.hide(1000); r.vault.show(301_000); expect(r.mount.read()).toEqual({ status: "loading", data: null, asOf: null });
  });
  it("a copy under another key is not read", () => {
    const v = createVault(); v.put("orders", P);
    const m = createInboxMount({ vault: v, loadScreen: async () => ({ attachInboxHost: () => undefined }), makeHost: () => ({} as never), openConversations: async () => null, poll: async () => undefined, subscribeAll: () => () => undefined });
    expect(m.read().data).toBeNull();
  });
});

describe("the real inbox controller after lock", () => {
  it("through the mount: the open chat no longer draws any message, name or number", async () => {
    const r = rig(); const c = createInboxController(r.hostFor(r.mount.read));
    await c.act("open-chat", { id: "c1" }); expect(leaks(c.html()).length).toBeGreaterThan(2); // sanity: it did draw them
    r.vault.lock();
    expect(leaks(c.html())).toEqual([]); expect(leaks(c.model())).toEqual([]);
    expect(c.html()).not.toContain('class="thread"');
  });
  it("on a plain vault reader too (the controller itself keeps no copy)", async () => {
    const r = rig();
    const c = createInboxController(r.hostFor(() => { const d = r.vault.get<typeof P>("conversations"); return d ? { status: "ready", data: d, asOf: NOW } : { status: "loading", data: null, asOf: null }; }));
    await c.act("open-chat", { id: "c1" }); r.vault.lock();
    expect(leaks(c.html())).toEqual([]); expect(leaks(c.model())).toEqual([]);
  });
});
