// W5 SEC2 (W4SEC-06): a hostile relay puts an ALREADY EXECUTED and answered reply back in the queue and the desktop's cursor is back at 0.
// The customer must get ONE message, and the desktop must give the SAME answer. The REAL WhatsApp queue runs; only the sidecar send is a counting fake.
process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = await vi.hoisted(async () => { const rt = (await import("./roundtrip-env")).roundtripEnv(); return { rt, actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined), send: vi.fn(async (..._a: unknown[]) => ({ ok: true, id: "wamid-replay-1", status: "sent" })) }; });
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));
vi.mock("@/lib/whatsapp/sidecar-client", async (o) => { const real = await o<typeof import("@/lib/whatsapp/sidecar-client")>(); return { ...real, sidecar: { ...real.sidecar, status: (async () => ({ status: "connected", user: { id: "213555999000:12@s.whatsapp.net" } })) as never, send: ((...a: unknown[]) => hoisted.send(...a)) as never, receipt: (async () => null) as never } }; });
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanDb } from "@/lib/data/__tests__/helpers";
import { db } from "@/lib/db";
import { executeQueuedRemoteCommands } from "../../../src/lib/connected-platform/remote-command-executor";
import { openEnvelopeWeb } from "../../../src/lib/connected-platform/web";
import { phoneOf } from "./roundtrip-phone";
import { actorFor, buildRig, relayShop } from "./roundtrip-world";

const raw = db as unknown as PrismaClient;
const DEVICE = "phone_rt_0003";
const clock = { t: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function start() {
  clock.t = Date.now(); hoisted.actor = actorFor(DEVICE);
  const rig = await buildRig(DEVICE); await rig.publish();
  return { rig, phone: await phoneOf(rig, clock) };
}
/** The PC runs the command, but its answer never reaches the relay: the poll throws, the cursor stays, the next poll offers it again. */
async function chat() {
  const c = await db.conversation.create({ data: { channel: "whatsapp", contactName: "Samira", contactPhone: "213661234567", sourceId: "213661234567@s.whatsapp.net" } });
  const inbound = await db.message.create({ data: { conversationId: c.id, body: "hello", direction: "inbound", timestamp: new Date(Date.now() - 60_000) } });
  return { c, inbound, outbound: () => db.message.count({ where: { conversationId: c.id, direction: "outbound" } }) };
}
afterAll(() => hoisted.rt.dispose());
beforeEach(async () => {
  await cleanDb(raw);
  for (const m of ["whatsAppOutboundEffect", "message", "conversation", "projectionInvalidation", "outboxIntent", "domainEvent", "businessCommand", "businessAggregateVersion"] as const) await (db[m] as unknown as { deleteMany(): Promise<unknown> }).deleteMany();
  vi.clearAllMocks(); hoisted.trusted.mockImplementation(async () => hoisted.actor);
});


describe("an executed reply that the relay offers again after the cursor was reset", () => {
  it("is ONE customer message, ONE effect, ONE send, and the same sealed answer", async () => {
    const { rig, phone } = await start(); const { c, inbound, outbound } = await chat();
    await phone.outbox.enqueue({ kind: "command.messages.reply", target: { type: "conversation", id: c.id, lastSeenMessageId: inbound.id }, labelForUi: "Samira", draftText: "On the way" });
    await phone.outbox.flush();
    expect(await rig.runDesktop()).toMatchObject({ completed: 1 });
    await vi.waitFor(() => expect(hoisted.send).toHaveBeenCalledTimes(1));
    await phone.outbox.refresh(); await sleep(250);
    expect(await phone.only()).toMatchObject({ state: "committed" });

    const sql = rig.world.d1.sqlite;
    const stored = () => sql.prepare("SELECT state, result_json FROM connected_command").all() as Array<{ state: string; result_json: string | null }>;
    const deviceId = (await rig.identity()).deviceId; const pinned = await rig.pinned();
    const answer = async (json: string | null) => {
      const opened = await openEnvelopeWeb<{ state: string; result: unknown }>(JSON.parse(json ?? "null"), pinned.signingPublicKey, rig.phoneKeys.encryption.privateKey, { now: Date.now(), expect: { recipientId: deviceId, deviceId } });
      expect(opened.ok, JSON.stringify(opened)).toBe(true);
      return opened.ok ? opened.payload : null;
    };
    expect(stored()).toHaveLength(1);
    const first = await answer(stored()[0]?.result_json ?? null);
    expect(first).toMatchObject({ state: "committed" });

    // The hostile relay forgets the answer and queues the same signed command again; the desktop's cursor is back at 0.
    sql.prepare("UPDATE connected_command SET state = 'queued', completed_at = NULL, result_digest = NULL, result_json = NULL").run();
    const again = await executeQueuedRemoteCommands({ client: rig.client, desktopKeys: rig.desktop, context: { prisma: db, shop: relayShop } as never, after: 0 });
    expect(again).toMatchObject({ completed: 1 });
    await sleep(250);

    expect(stored()[0]?.state).toBe("committed");
    expect(await answer(stored()[0]?.result_json ?? null)).toEqual(first);
    expect(hoisted.send).toHaveBeenCalledTimes(1);
    expect(await outbound()).toBe(1);
    expect(await db.whatsAppOutboundEffect.count()).toBe(1);
  });
});
