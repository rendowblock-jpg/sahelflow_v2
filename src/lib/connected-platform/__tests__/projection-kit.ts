// Shared fixtures for the orders / conversations publisher tests.
import type { Phase2Action } from "@/lib/identity/permissions";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { openConnectedEnvelope } from "../envelope";
import { generateConnectedKeyPair } from "../payload-crypto";
import type { ConnectedEnvelope } from "../protocol";

export const DEVICE_ID = "7".repeat(32);
export const MEMBER_ID = "6".repeat(32);
export const NOW = new Date("2026-10-31T01:00:00.000Z");
const SHOP = Object.freeze({
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  shopId: "shop-test-a",
  shopIncarnationId: "3".repeat(32),
  registryRevision: 1,
  databaseFileId: "shop-a.db",
  migrationSetSha256: "4".repeat(64),
});

export function actor(role: "owner" | "operator", permissions?: readonly Phase2Action[]): TrustedActorContext {
  return {
    version: 1,
    actor: {
      kind: "person",
      personId: "5".repeat(32),
      workspaceMemberId: MEMBER_ID,
      deviceId: "8".repeat(32),
      sessionId: "session-1",
      role,
      policyVersion: 1,
      revocationEpoch: 0,
      ...(permissions ? { permissions } : {}),
    },
    shop: SHOP,
  } as TrustedActorContext;
}

/** An in-memory Setting table for db.$transaction. */
export function settingTx(store: Map<string, string>) {
  return {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        store.has(where.key) ? { key: where.key, value: store.get(where.key) as string } : null,
      upsert: async ({ where, create, update }: {
        where: { key: string };
        create: { value: string };
        update: { value: string };
      }) => {
        store.set(where.key, store.has(where.key) ? update.value : create.value);
        return {};
      },
    },
  };
}

export function makeRig() {
  const desktop = generateConnectedKeyPair();
  const phone = generateConnectedKeyPair();
  const sent: ConnectedEnvelope[] = [];
  const client = {
    listDevices: async () => ({
      devices: [{
        device_id: DEVICE_ID,
        member_id: MEMBER_ID,
        encryption_public_key: phone.encryptionPublicKeyJwk,
        revocation_epoch: 0,
      }],
    }),
    putCommandPolicy: async () => ({ status: "stored", policyVersion: 1 }),
    putProjection: async (envelope: ConnectedEnvelope) => {
      sent.push(envelope);
      return { status: "stored", sequence: envelope.sequence };
    },
  };
  const open = <T>(envelope: ConnectedEnvelope): T =>
    openConnectedEnvelope<T>(
      envelope,
      desktop.signingPublicKey,
      phone.encryptionPrivateKeyPkcs8,
      new Date("2026-10-31T01:05:00.000Z"),
    ).payload;
  return { desktop, phone, client, sent, open };
}
