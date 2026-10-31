process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = await vi.hoisted(async () => { const rt = (await import("./roundtrip-env")).roundtripEnv(); return { rt, actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined) }; });
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));
import { readFileSync } from "node:fs";
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { publishRemoteConversationsProjection } from "../../../src/lib/connected-platform/conversations-projection";
import { createCommandStack } from "../src/app/commands";
import { createDirectPoll } from "../src/app/direct-poll";
import { createInboxMount } from "../src/app/inbox-mount";
import { createVault } from "../src/storage/sealed";
import { wipeAll } from "../src/storage/wipe";
import { createRelayClient } from "../src/today/relay-source";
import { RELAY, actorFor, buildRig } from "./roundtrip-world";

// W3b F6a job 1: every DIRECT poll (inbox, orders) acts on a revoked answer at once, on the REAL relay worker: the device is revoked on the
// relay, the inbox is opened, and the vault, the stores and the screen state are gone. A pc-off answer keeps the last copy.
const raw = db as unknown as PrismaClient; const DEVICE = "phone_rt_0003"; const clock = { t: 0 };
const factory = { deleteDatabase: () => { const r: { onsuccess?: () => void } = {}; queueMicrotask(() => r.onsuccess?.()); return r; } } as unknown as IDBFactory;
async function start() {
  clock.t = Date.now(); hoisted.actor = actorFor(DEVICE);
  const rig = await buildRig(DEVICE); await rig.publish();
  await db.conversation.create({ data: { id: "conv-plain-0001", channel: "whatsapp", contactName: "Plain Pat", contactPhone: "06610001", sourceId: "p@s.whatsapp.net", unreadCount: 0, lastMessageAt: new Date(clock.t - 60_000) } });
  await db.message.create({ data: { id: "conv-plain-0001-m1", conversationId: "conv-plain-0001", body: "Is this still available?", direction: "inbound", timestamp: new Date(clock.t - 60_000), messageType: "text" } });
  await publishRemoteConversationsProjection({ client: rig.client, desktopKeys: rig.desktop, actorContext: actorFor(DEVICE), deviceId: DEVICE, now: new Date(clock.t) });
  const flags = { pcOff: false }; const now = (): number => clock.t;
  const relayFetch: typeof fetch = async (i, init) => (flags.pcOff && String(i).includes("type=conversations") ? new Response("{}", { status: 404 }) : rig.relayFetch(i, init));
  const relay = createRelayClient({ baseUrl: RELAY, fetchImpl: relayFetch, getDb: async () => rig.db, now });
  await relay.poll(); const stack = await createCommandStack({ db: rig.db, relayBase: RELAY, fetch: relayFetch, now });
  if (!stack) throw new Error("setup: no stack");
  const vault = createVault(); const shown: unknown[] = []; const wipes = { n: 0 };
  const wipe = async () => { wipes.n += 1; vault.lock(); return wipeAll({ db: rig.db, factory, caches: null, unregister: async () => undefined, storage: { keys: () => [], remove: () => undefined } }); };
  const directPoll = createDirectPoll({ poll: (k) => relay.poll(k), wipe, onRevoked: (r) => shown.push(r) });
  const mount = createInboxMount({ vault, loadScreen: async () => ({ attachInboxHost: () => undefined }), makeHost: () => ({}) as never, openConversations: stack.openConversations, poll: async () => { await directPoll("conversations"); await stack.refresh(); }, subscribeAll: () => () => undefined });
  expect(await mount.visit("inbox")).toBe(true); await mount.reload(); expect(mount.lastReload()).toBe("ok");
  expect(vault.get("conversations")).not.toBeNull(); expect((await rig.db.keys("sealed")).length).toBeGreaterThan(0); // control: there is a copy to lose
  return { rig, vault, mount, directPoll, shown, wipes, flags };
}
afterAll(() => { hoisted.rt.dispose(); });
beforeEach(async () => { await cleanDb(raw); await db.collaborationComment.deleteMany(); await db.businessAggregateVersion.deleteMany(); await db.message.deleteMany(); await db.conversation.deleteMany(); vi.clearAllMocks(); hoisted.trusted.mockImplementation(async () => hoisted.actor); });

describe("a direct poll acts on a revoked answer at once", () => {
  it("the PC revokes the phone, the inbox opens: vault empty, stores wiped, the revoked screen is asked for once", async () => {
    const { rig, vault, mount, shown } = await start();
    await rig.revoke(); await mount.reload();
    expect(vault.get("conversations")).toBeNull(); expect(vault.get("conversations.asOf")).toBeNull(); expect(mount.read().data).toBeNull(); expect(mount.lastReload()).toBe("failed");
    expect(await rig.db.keys("sealed")).toEqual([]); expect(await rig.db.keys("keys")).toEqual([]);
    expect(shown).toEqual([{ kind: "revoked", wiped: true, failed: [] }]);
  });
  it("the orders reload goes through the same function: revoked answer, same wipe, and the caller gets an error (it must stop)", async () => {
    const { rig, vault, directPoll, shown } = await start();
    await rig.revoke(); await expect(directPoll("orders")).rejects.toThrow("revoked");
    expect(vault.get("conversations")).toBeNull(); expect(await rig.db.keys("sealed")).toEqual([]); expect(shown).toHaveLength(1);
  });
  it("two direct polls at once share ONE wipe and ONE revoked screen", async () => {
    const { rig, directPoll, shown, wipes } = await start();
    await rig.revoke(); const out = await Promise.allSettled([directPoll("orders"), directPoll("conversations")]);
    expect(out.map((o) => o.status)).toEqual(["rejected", "rejected"]); expect(wipes.n).toBe(1); expect(shown).toHaveLength(1);
  });
  it("a pc-off answer keeps the last copy, wipes nothing, shows no revoked screen", async () => {
    const { rig, vault, mount, shown, wipes, flags } = await start();
    flags.pcOff = true; await mount.reload();
    expect(vault.get("conversations")).not.toBeNull(); expect((await rig.db.keys("sealed")).length).toBeGreaterThan(0); expect(wipes.n).toBe(0); expect(shown).toEqual([]);
  });
  it("app.ts has no bare relay.poll for the orders or the inbox: both go through directPoll", () => {
    const src = readFileSync(new URL("../src/app/app.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/relay\.poll\(\s*"(orders|conversations)"/); expect(src).toContain('directPoll("orders")'); expect(src).toContain('directPoll("conversations")');
  });
});
