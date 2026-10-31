// The whole command path in one place (no hand-typed hop): the REAL relay worker on the node:sqlite D1 harness, the REAL
// ConnectedPlatformClient, a REAL pairing flow for the phone, the desktop's own projection publisher. The test files add the
// desktop mocks (trusted actor, automations, CAPI, WhatsApp sender) and the real SQLite database.
import { vi } from "vitest";
import worker from "../../connected/worker";
import { RELAY, createWorld } from "../../connected/__tests__/harness";
import { ConnectedPlatformClient } from "../../../src/lib/connected-platform/client";
import { executeQueuedRemoteCommands } from "../../../src/lib/connected-platform/remote-command-executor";
import { publishRemoteDashboardProjection } from "../../../src/lib/connected-platform/desktop-projection";
import { buildDesktopPairingLink } from "../../../src/lib/connected-platform/pairing-link";
import { encodeDesktopKeyProof, importDesktopSigningPrivateKey, signDesktopEncryptionKey } from "../../../src/lib/connected-platform/pairing-trust";
import { generateConnectedKeyPair } from "../../../src/lib/connected-platform/payload-crypto";
import { generateDeviceKeys } from "../../../src/lib/connected-platform/web";
import { shopContext, db as desktopDb } from "@/lib/db";
import { runPairing, takePairingLink, type KeygenRunner, type PairStore } from "../src/pair/flow";
import { createFetchTransport } from "../src/pair/transport";
import { STORES, saveDeviceKeys, type Db, type StoreName } from "../src/storage/idb";
import type { PairingIdentity, TrustedDesktop } from "../src/pair/pinned";

export { RELAY };
export const MEMBER = "a".repeat(32);
// The desktop database is bound to ONE shop identity (32-hex workspace, protected keys): the relay world takes THAT identity.
// The relay refuses a shop id under 8 characters (validIdentity in connected/worker.ts: HEX_ID or OPAQUE_ID); the desktop test shop
// id is "test", so the rig uses the same shop with a valid opaque id (the old isConnectedEnvelope mock is no longer needed).
export const relayShop = { ...shopContext, shopId: "testshop0001" };

export function memoryDb(): Db {
  const stores = new Map<string, Map<string, unknown>>();
  const of = (n: string): Map<string, unknown> => { let m = stores.get(n); if (!m) { m = new Map(); stores.set(n, m); } return m; };
  return {
    get: async <T>(n: StoreName, k: string) => of(n).get(k) as T | undefined,
    put: async (n, k, v) => { of(n).set(k, v); }, remove: async (n, k) => { of(n).delete(k); },
    clear: async (n) => { of(n).clear(); }, keys: async (n) => [...of(n).keys()], close: () => undefined,
  };
}

export function actorFor(deviceId: string, over: Record<string, unknown> = {}): never {
  return { version: 1, actor: { kind: "person", personId: "5".repeat(32), workspaceMemberId: MEMBER, deviceId, sessionId: "s", role: "owner", policyVersion: 1, revocationEpoch: 0, ...over }, shop: relayShop } as never;
}

export async function buildRig(deviceId: string) {
  const desktop = generateConnectedKeyPair();
  const made = await generateDeviceKeys(); if (!made.ok) throw new Error("setup: phone keys");
  const world = await createWorld({ desktop: { signingPublicKeyBase64: desktop.signingPublicKey, encryptionPublicKeyJwk: desktop.encryptionPublicKeyJwk } });
  world.d1.sqlite.prepare("UPDATE connected_workspace SET workspace_id = ?, installation_id = ? WHERE workspace_id = ?").run(relayShop.workspaceId, relayShop.installationId, "ws_00000001");
  const relayFetch = ((input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), world.env)) as typeof fetch;
  vi.stubGlobal("fetch", relayFetch);
  const client = new ConnectedPlatformClient({ endpoints: { control: RELAY, storefront: RELAY, backup: RELAY }, controlToken: async () => world.desktopToken, backupToken: async () => "b".repeat(40), timeoutMs: 5_000 });
  const signer = await importDesktopSigningPrivateKey(desktop.signingPrivateKeyPkcs8); if (!signer) throw new Error("setup: signer");
  const signed = await signDesktopEncryptionKey(desktop.encryptionPublicKeyJwk, signer); if (!signed.ok) throw new Error("setup: sign");
  const proof = encodeDesktopKeyProof(signed.signature, signed.context); if (!proof) throw new Error("setup: proof");
  const pairing = await client.createPairing({ workspaceId: relayShop.workspaceId, memberId: MEMBER, deviceId, desktopKeyProof: proof });
  const built = await buildDesktopPairingLink({ pairingId: pairing.pairingId, pairingToken: pairing.pairingToken, desktopSigningPublicKey: desktop.signingPublicKey });
  if (!built) throw new Error("setup: link");
  const taken = takePairingLink(built.hash, "/", () => undefined); if (taken.kind !== "link") throw new Error("setup: take");
  const db = memoryDb();
  const keygen: KeygenRunner = { async run(onStep) { onStep("signing"); onStep("encryption"); return { ok: true, keys: made.keys, publicKeys: made.publicKeys }; } };
  const store: PairStore = {
    saveKeys: (k) => saveDeviceKeys(db, k), saveTrust: (t) => db.put("keys", "desktop", t), saveCredentials: (c) => db.put("keys", "credentials", c),
    discard: async () => { for (const s of STORES) await db.clear(s); },
  };
  const paired = await runPairing({ link: taken.link, online: true, keygen, store, onStep: () => undefined, transport: createFetchTransport({ baseUrl: RELAY, fetchImpl: relayFetch }) });
  if (!paired.ok) throw new Error(`setup: pairing ${paired.reason}`);
  let cursor = 0;
  return {
    world, client, desktop, db, relayFetch,
    revoke: () => world.call(`/v1/desktop/devices/${deviceId}/revoke`, { method: "POST", token: world.desktopToken, body: { workspaceId: relayShop.workspaceId, revocationEpoch: 1 } }), phoneKeys: made.keys,
    pinned: async () => (await db.get<TrustedDesktop>("keys", "desktop")) as TrustedDesktop,
    identity: async () => (await db.get<PairingIdentity>("keys", "credentials")) as PairingIdentity,
    // The desktop publishes the way the app does: policy to the relay, then the sealed dashboard with connectedCommandAuthority.
    publish: (over: Record<string, unknown> = {}) => publishRemoteDashboardProjection({ client, desktopKeys: desktop, actorContext: actorFor(deviceId, over), deviceId }),
    // One desktop poll: the real client, the F2 executor on the real SQLite file; `at` steps the desktop clock.
    runDesktop: async (at?: number) => {
      const out = await executeQueuedRemoteCommands({ client, desktopKeys: desktop, context: { prisma: desktopDb, shop: relayShop } as never, after: cursor, ...(at === undefined ? {} : { now: () => new Date(at) }) });
      cursor = out.nextCursor; return out;
    },
  };
}
