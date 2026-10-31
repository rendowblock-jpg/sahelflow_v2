process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const hoisted = await vi.hoisted(async () => { const rt = (await import("./roundtrip-env")).roundtripEnv(); return { rt, actor: null as unknown, trusted: vi.fn(), dispatch: vi.fn(async () => undefined), capi: vi.fn(async () => undefined), queue: vi.fn(), process: vi.fn(async () => undefined) }; });
vi.mock("@/lib/identity/trusted-actor", async (o) => ({ ...(await o<typeof import("@/lib/identity/trusted-actor")>()), isTrustedActorContext: vi.fn(() => true), trustedActorForRemoteCommand: (...a: unknown[]) => hoisted.trusted(...a) }));
vi.mock("@/lib/automations/engine", async (o) => ({ ...(await o<typeof import("@/lib/automations/engine")>()), dispatchTrigger: hoisted.dispatch }));
vi.mock("@/lib/meta/capi-triggers", async (o) => ({ ...(await o<typeof import("@/lib/meta/capi-triggers")>()), fireCapiStageForOrder: hoisted.capi }));
vi.mock("@/lib/whatsapp/durable-send", async (o) => ({ ...(await o<typeof import("@/lib/whatsapp/durable-send")>()), queueWhatsAppText: hoisted.queue, processWhatsAppEffect: hoisted.process }));
import type { PrismaClient } from "@prisma/client";
import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, it, vi } from "vitest";
import { db } from "@/lib/db";
import { publishRemoteConversationsProjection } from "../../../src/lib/connected-platform/conversations-projection";
import { publishRemoteDashboardProjection } from "../../../src/lib/connected-platform/desktop-projection";
import { publishRemoteOrdersProjection } from "../../../src/lib/connected-platform/orders-projection";
import { buildDesktopPairingLink } from "../../../src/lib/connected-platform/pairing-link";
import { encodeDesktopKeyProof, importDesktopSigningPrivateKey, signDesktopEncryptionKey } from "../../../src/lib/connected-platform/pairing-trust";
import { buildPwa } from "../build.mjs";
import { bridge, closeAll, control, listen, staticApp } from "./phone-lab-servers";
import { seedWorld } from "./phone-lab-seed";
import { MEMBER, actorFor, buildRig, relayShop } from "./roundtrip-world";

// W3b PWA lab (PHONE_LAB=1 only): the real relay worker + the BUILT phone app + a control endpoint over a real SQLite, kept alive until
// /tmp/phone-lab.stop exists (or 14 minutes). Playwright (e2e/phone-lab.spec.ts) drives the phone app in Chromium against it.
const PWA = "http://127.0.0.1:4580"; const RELAY_URL = "http://127.0.0.1:4581"; const CTL = "http://127.0.0.1:4582";
const STOP = "/tmp/phone-lab.stop"; const INFO = "/tmp/phone-lab.json"; const LOG = "/tmp/phone-lab.log";
const raw = db as unknown as PrismaClient;
afterAll(() => { hoisted.rt.dispose(); });

describe("the phone lab: a real browser against the real relay and a real SQLite", () => {
  it.skipIf(!process.env.PHONE_LAB)("lab", async () => {
    const log = (m: string): void => appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`);
    rmSync(STOP, { force: true }); rmSync(LOG, { force: true });
    hoisted.trusted.mockImplementation(async () => hoisted.actor);
    hoisted.queue.mockImplementation(async (_c: unknown, input: { text: string; conversationId: string }) => {
      await db.message.create({ data: { conversationId: input.conversationId, body: input.text, direction: "outbound", timestamp: new Date() } });
      const n = ++sendSeq; return { messageId: `msg-lab-${n}`, effectKey: `effect-lab-${n}`, replayed: false };
    });
    let sendSeq = 0; let count = 0; const nextDevice = (): string => `phone_lab_${String(++count + 1).padStart(4, "0")}`;
    let device = nextDevice(); hoisted.actor = actorFor(device);
    const rig = await buildRig("phone_rt_0001");
    (rig.world.env as { PWA_ORIGINS?: string }).PWA_ORIGINS = PWA;
    rig.world.d1.sqlite.prepare("UPDATE connected_workspace SET device_limit = 8, member_limit = 8").run(); // a lab session pairs several browsers
    let seeded = await seedWorld(Date.now());
    const signer = await importDesktopSigningPrivateKey(rig.desktop.signingPrivateKeyPkcs8); if (!signer) throw new Error("lab: signer");
    const newPairing = async (id: string): Promise<string> => {
      const signed = await signDesktopEncryptionKey(rig.desktop.encryptionPublicKeyJwk, signer); if (!signed.ok) throw new Error("lab: sign");
      const proof = encodeDesktopKeyProof(signed.signature, signed.context); if (!proof) throw new Error("lab: proof");
      const p = await rig.client.createPairing({ workspaceId: relayShop.workspaceId, memberId: MEMBER, deviceId: id, desktopKeyProof: proof });
      const built = await buildDesktopPairingLink({ pairingId: p.pairingId, pairingToken: p.pairingToken, desktopSigningPublicKey: rig.desktop.signingPublicKey });
      if (!built) throw new Error("lab: link");
      return `${PWA}/${built.hash.startsWith("#") ? "" : "#"}${built.hash}`;
    };
    // The loop: the REAL executor takes queued commands; the three projections are re-sealed for the browser's device.
    let frozen = false; let dirty = true; let lastPub = 0; let lastSig = ""; let chain: Promise<unknown> = Promise.resolve();
    const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run.catch(() => undefined); return run; };
    const publishAll = async (): Promise<void> => {
      // Each projection on its own: one failure (a device that is mid-pairing is not enrolled yet) never skips the others, and the log names it.
      const base = { client: rig.client, desktopKeys: rig.desktop, actorContext: actorFor(device), deviceId: device };
      const each = async (name: string, run: () => Promise<unknown>): Promise<void> => { try { await run(); } catch (e) { log(`publish ${name} (${device}): ${e instanceof Error ? e.message : String(e)}`); failed = true; } };
      let failed = false;
      await each("dashboard", () => publishRemoteDashboardProjection(base)); await each("orders", () => publishRemoteOrdersProjection({ ...base, now: new Date() }));
      if (!frozen) await each("conversations", () => publishRemoteConversationsProjection({ ...base, now: new Date() }));
      if (failed) throw new Error("a projection failed");
    };
    const tick = (): Promise<void> => serial(async () => {
      const out = await rig.runDesktop().catch((e: unknown) => { log(`desktop: ${e instanceof Error ? e.message : String(e)}`); return null; });
      const sig = JSON.stringify(out); if (sig !== lastSig) { lastSig = sig; dirty = true; }
      if (dirty || Date.now() - lastPub > 10_000) {
        try { await publishAll(); dirty = false; lastPub = Date.now(); } catch (e) { log(`publish: ${e instanceof Error ? e.message : String(e)}`); }
      }
    });
    const outDir = mkdtempSync(join(tmpdir(), "sf-lab-pwa-")); await buildPwa({ outDir, relayUrl: RELAY_URL });
    const order = async (key: string) => { const r = await raw.order.findFirst({ where: { OR: [{ id: key }, { orderNumber: key }] } }); return { id: r?.id ?? null, orderNumber: r?.orderNumber ?? null, status: r?.status ?? null }; };
    const servers = [
      await listen(staticApp(outDir), 4580),
      await listen(bridge(RELAY_URL, (r) => import("../../connected/worker").then((m) => m.default.fetch(r, rig.world.env))), 4581),
      await listen(control(async (path, q) => {
        if (path === "/orders") return Promise.all(seeded.map(async (o) => ({ ...o, status: (await order(o.id)).status })));
        if (path === "/projections") return { device, rows: rig.world.d1.sqlite.prepare("SELECT * FROM connected_projection").all().map((r) => ({ type: (r as Record<string, unknown>).projection_type ?? (r as Record<string, unknown>).type ?? null, device: (r as Record<string, unknown>).device_id ?? null, seq: (r as Record<string, unknown>).sequence ?? null })) };
        if (path === "/order") return order(q.get("id") ?? "");
        if (path === "/sends") return { count: hoisted.queue.mock.calls.length, texts: hoisted.queue.mock.calls.map((c) => (c[1] as { text: string }).text) };
        if (path === "/newpair") { device = nextDevice(); hoisted.actor = actorFor(device); frozen = false; dirty = true; return { device, pairingUrl: await newPairing(device) }; }
        if (path === "/revoke") { const r = await rig.world.call(`/v1/desktop/devices/${device}/revoke`, { method: "POST", token: rig.world.desktopToken, body: { workspaceId: relayShop.workspaceId, revocationEpoch: 1 } }); return { device, status: r.status }; }
        if (path === "/reseed") return serial(async () => { frozen = false; sendSeq = 0; hoisted.queue.mockClear(); seeded = await seedWorld(Date.now()); dirty = true; await publishAll().then(() => { dirty = false; lastPub = Date.now(); }, () => undefined); return { reseeded: seeded.length, orders: seeded }; });
        if (path === "/freeze") { frozen = true; return { frozen }; }
        if (path === "/republish") { frozen = false; dirty = true; await tick(); return { frozen, dirty }; }
        return { ok: true, device, frozen, orders: seeded.length };
      }), 4582),
    ];
    try {
      writeFileSync(INFO, JSON.stringify({ pwa: PWA, relay: RELAY_URL, labCtl: CTL, device, pairingUrl: await newPairing(device), orders: seeded }, null, 2));
      const deadline = Date.now() + 40 * 60_000;
      while (!existsSync(STOP) && Date.now() < deadline) { await tick(); await new Promise((r) => setTimeout(r, 1500)); }
    } finally { await closeAll(servers); rmSync(outDir, { recursive: true, force: true }); rmSync(INFO, { force: true }); }
  }, 42 * 60_000);
});
