// W3b SEC check 2: what the phone writes to disk. The contact's name and number never go into the outbox row; a wipe leaves nothing.
import { describe, expect, it } from "vitest";
import { createOutbox } from "../src/outbox/outbox";
import { STORES, type Db } from "../src/storage/idb";
import { wipeAll } from "../src/storage/wipe";
import { routeRequest } from "../src/sw/strategy";
import { createInboxHost } from "../src/views/inbox/host";
import { createDraftStore, submitNote } from "../src/views/notes";
import { NOW, conv, memDb, proj } from "./inbox-fixtures";

const NAME = "Amina Benali"; const PHONE = "0550123456"; const CID = "conv_00000001";
async function dump(db: Db): Promise<string> {
  const out: unknown[] = []; for (const s of STORES) for (const k of await db.keys(s)) out.push([s, k, await db.get(s, k)]);
  return JSON.stringify(out);
}
function rig() {
  const db = memDb(); let n = 0;
  const outbox = createOutbox({
    db, now: () => NOW, deviceId: "phone_pwa_0001", newId: () => `id_${String(++n).padStart(8, "0")}`, policyVersion: () => 7,
    seal: async (i) => JSON.stringify({ c: i.commandId }), post: async () => { throw new Error("network"); },
    status: async () => ({ status: 200, body: { state: "queued", result: null } }), openResult: async () => ({ ok: false, reason: "malformed" }),
  });
  const host = createInboxHost({
    outbox, readConversations: () => ({ status: "ready", data: proj([conv({ id: CID, contactName: NAME, phone: PHONE })]), asOf: NOW - 60_000 }), reload: async () => undefined,
    drafts: createDraftStore(db, () => NOW), subscribeAll: () => () => undefined, go: () => undefined,
    now: () => NOW, locale: () => "en", online: () => true, pcOff: () => true, authorityExpiresAt: () => NOW + 5,
  });
  return { db, host, outbox };
}

describe("the outbox row on disk", () => {
  it("a reply row holds neither the contact's name nor the number (the label is never read back)", async () => {
    const r = rig();
    const put = await r.host.enqueueReply({ conversationId: CID, text: "Oui, taille M disponible", lastSeenMessageId: "m3" });
    expect(put.ok).toBe(true);
    const disk = await dump(r.db);
    expect(disk).not.toContain(NAME); expect(disk).not.toContain(PHONE);
    const rows = await r.outbox.list(); expect(rows.map((x) => x.labelForUi)).toEqual([""]);
  });
  it("a note row does not keep its first 80 characters a second time as a label", async () => {
    const r = rig(); const text = `${NAME} veut livraison chez 12 rue Didouche`;
    expect(await submitNote({ entityType: "conversation", entityId: CID, noteVersion: 4 }, text, { enqueue: (i) => r.host.enqueueNote(i), drafts: r.host.drafts })).toBe("queued");
    const rows = await r.outbox.list();
    expect(rows.map((x) => x.labelForUi)).toEqual([""]);
    expect(rows[0]?.draftText).toBe(text); // the note text itself stays (the screen draws it); one copy, not two
  });
  it("an order decision keeps the order number as its label (not personal data)", async () => {
    const r = rig();
    await r.outbox.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 }, labelForUi: "SF-1042", draftText: "" });
    expect((await r.outbox.list()).map((x) => x.labelForUi)).toEqual(["SF-1042"]);
  });
});

describe("a wipe leaves nothing readable", () => {
  it("every store is empty, every sf.* key and sfapp cache is gone, and a typed draft with it", async () => {
    const r = rig(); await r.host.enqueueReply({ conversationId: CID, text: "secret reply", lastSeenMessageId: "m3" });
    await r.host.drafts.set("draft.note.conversation.c1", "typed but not sent");
    await r.db.put("sealed", "orders", { kind: "orders", envelope: {} }); await r.db.put("keys", "device", { k: 1 }); await r.db.put("projections", "dashboard", { n: 1 });
    const ls = new Map([["sf.locale", "ar"], ["sf.theme", "dark"], ["sf.pin", "x"]]); const caches = new Set(["sfapp-v1", "sfapp-v2"]);
    const res = await wipeAll({
      db: r.db, dbName: "sf", factory: { deleteDatabase: () => { const q: { onsuccess?: () => void } = {}; queueMicrotask(() => q.onsuccess?.()); return q; } } as never,
      caches: { keys: async () => [...caches], delete: async (k: string) => caches.delete(k) } as never, unregister: async () => undefined,
      storage: { keys: () => [...ls.keys()], remove: (k: string) => { ls.delete(k); } } as never,
    });
    expect(res.ok).toBe(true);
    expect(await dump(r.db)).toBe("[]"); expect([...ls.keys()]).toEqual([]); expect([...caches]).toEqual([]);
  });
});

describe("the service worker never keeps a relay or API answer", () => {
  const base = { method: "GET", mode: "cors", origin: "https://app.example", precache: ["/", "/index.html", "/assets/app-abcdef12.js"] };
  it.each(["https://app.example/v1/commands/c1", "https://app.example/v1/projections", "https://app.example/api/orders", "https://relay.example/v1/commands", "https://app.example/orders.json"])("%s is not intercepted", (url) => {
    expect(routeRequest({ ...base, url })).toBe("bypass");
  });
  it("a POST is never intercepted", () => { expect(routeRequest({ ...base, url: "https://app.example/", method: "POST" })).toBe("bypass"); });
});
