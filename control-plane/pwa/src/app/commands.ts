// W3-F3 step C(1): the phone's command stack as the app builds it. The outbox runs on the REAL transport (createPhoneTransport):
// no injected fake. Null until the phone is paired (keys, pinned desktop and credentials all exist). The shop id is a getter
// (the poll learns it after pairing); the policy version and scope come from the last verified dashboard (authority.ts).
import type { OrdersProjection } from "../../../../src/lib/connected-platform/contracts";
import { newCommandId } from "../outbox/ids";
import { createOutbox } from "../outbox/outbox";
import type { PairingIdentity, TrustedDesktop } from "../pair/pinned";
import { loadDeviceKeys, type Db } from "../storage/idb";
import { getSealed, openSealed } from "../storage/sealed";
import { createAuthority } from "../sync/authority";
import { createPhoneTransport } from "../sync/transport";
import { createDraftStore } from "../views/notes";
import type { OpenedOrders } from "./orders-host";

export type CommandStackDeps = Readonly<{ db: Db; relayBase: string; fetch: typeof fetch; now(): number }>;

export async function createCommandStack(d: CommandStackDeps) {
  const identity = await d.db.get<PairingIdentity>("keys", "credentials"); const pinned = await d.db.get<TrustedDesktop>("keys", "desktop");
  const keys = await loadDeviceKeys(d.db);
  if (!identity || !pinned || !keys) return null;
  const deviceId = identity.deviceId; const signingPublicKey = pinned.signingPublicKey; const encryptionPrivateKey = keys.encryption.privateKey;
  const authority = createAuthority(d.db); let shop: string | null = identity.shopId;
  /** After every poll that stored something: re-read the command authority and the shop the poll learned. */
  const refresh = async (): Promise<void> => {
    await authority.load();
    const c = await d.db.get<PairingIdentity>("keys", "credentials"); shop = c?.shopId ?? shop;
  };
  await refresh();
  const transport = createPhoneTransport({ relayBase: d.relayBase, keys, pinned, identity, scope: authority.scope, shopId: () => shop, fetch: d.fetch, now: d.now });
  const outbox = createOutbox({ db: d.db, now: d.now, deviceId, newId: () => newCommandId(), policyVersion: authority.policyVersion, ...transport });
  async function openOrders(): Promise<OpenedOrders | null> {
    const row = await getSealed(d.db, "orders"); if (!row) return null;
    const data = await openSealed<OrdersProjection>(row, { signingPublicKey, encryptionPrivateKey, deviceId, now: d.now() });
    return data && Array.isArray(data.orders) ? { data, asOf: row.receivedAt } : null;
  }
  // authorityExpiresAt: when the PC's command authority ends (verified projection), so a command chip can show the PC time.
  return { outbox, refresh, openOrders, drafts: createDraftStore(d.db, d.now), shopId: (): string | null => shop, authorityExpiresAt: authority.expiresAt };
}
export type CommandStack = NonNullable<Awaited<ReturnType<typeof createCommandStack>>>;
