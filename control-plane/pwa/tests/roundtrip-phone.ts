// The phone half of the round trip, assembled the way the app will: the relay poll learns the shop and the command authority
// from the PC's own sealed projection, the transport reads its scope from that, the outbox uses the transport as it is.
import { newCommandId } from "../src/outbox/ids";
import { createOutbox } from "../src/outbox/outbox";
import { createAuthority } from "../src/sync/authority";
import { createPhoneTransport } from "../src/sync/transport";
import { createRelayClient } from "../src/today/relay-source";
import { RELAY, type buildRig } from "./roundtrip-world";

export type Rig = Awaited<ReturnType<typeof buildRig>>;
export async function phoneOf(rig: Rig, clock: { t: number }, fetchImpl: typeof fetch = rig.relayFetch) {
  const now = (): number => clock.t;
  const relay = createRelayClient({ baseUrl: RELAY, fetchImpl, getDb: async () => rig.db, now });
  const authority = createAuthority(rig.db);
  const polled = await relay.poll();
  await authority.load();
  const identity = await rig.identity();
  const transport = createPhoneTransport({ relayBase: RELAY, keys: rig.phoneKeys, pinned: await rig.pinned(), identity, scope: authority.scope, fetch: fetchImpl, now });
  const outbox = createOutbox({ db: rig.db, now, deviceId: identity.deviceId, newId: () => newCommandId(), policyVersion: authority.policyVersion, ...transport });
  const only = async () => (await outbox.list())[0];
  return { relay, authority, outbox, polled, now, identity, only };
}
