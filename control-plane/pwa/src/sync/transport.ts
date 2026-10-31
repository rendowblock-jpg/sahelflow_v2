// The phone's real command transport: seal (phone -> PC envelope the desktop opener reads), post / status (the relay's real
// routes) and openResult (the sealed result, opened with the PINNED PC signing key). Nothing here decides what is "done":
// the outbox only calls a command committed when openResult returns a verified result for this device and this command.
import { COMMAND_EXPIRY_MS } from "../../../../src/lib/connected-platform/contracts";
import { CONNECTED_CIPHER_ALGORITHM, CONNECTED_PROTOCOL_VERSION, CONNECTED_SIGNATURE_ALGORITHM } from "../../../../src/lib/connected-platform/protocol";
import { openEnvelopeWeb, sealEnvelopeWeb, type DeviceKeys } from "../../../../src/lib/connected-platform/web";
import type { Reply, ParsedResult, SealInput } from "../outbox/outbox";
import type { PairingIdentity, TrustedDesktop } from "../pair/pinned";

export type PhoneScope = Readonly<{ installationId: string; revocationEpoch: number }>;
export type PhoneTransportOptions = Readonly<{
  relayBase: string; keys: DeviceKeys; pinned: TrustedDesktop; identity: PairingIdentity;
  /** The PC's installation id and this member's revocation epoch, as the last verified projection / command authority named them. */
  scope(): PhoneScope | null;
  /** The shop id, read at every seal: the poll learns it AFTER the transport is built. Without it identity.shopId is used (a snapshot). */
  shopId?(): string | null;
  fetch: typeof fetch; now(): number;
}>;
type Metadata = Parameters<typeof sealEnvelopeWeb>[0];
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export function createPhoneTransport(o: PhoneTransportOptions) {
  const base = o.relayBase.replace(/\/+$/, "");
  const headers = { authorization: `Bearer ${o.identity.deviceToken}` };
  const send = async (url: string, init: RequestInit): Promise<Reply> => {
    const res = await o.fetch(url, { ...init, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store" });
    const body: unknown = await res.json().catch(() => null);
    const wait = Number(res.headers.get("Retry-After"));
    return { status: res.status, body, ...(Number.isFinite(wait) && wait > 0 ? { retryAfterMs: Math.round(wait * 1000) } : {}) };
  };
  return {
    async seal(i: SealInput): Promise<string> {
      const scope = o.scope(); if (!scope) throw new Error("no_scope");
      const shopId = o.shopId ? o.shopId() : o.identity.shopId; if (!shopId) throw new Error("no_shop");
      // issuedAt is never earlier than expiresAt - the kind's lifetime: the PC refuses a command that lives longer than its kind allows.
      const issuedAt = Math.max(o.now(), i.expiresAt - COMMAND_EXPIRY_MS[i.kind]);
      const metadata: Metadata = {
        protocolVersion: CONNECTED_PROTOCOL_VERSION, envelopeId: i.commandId, idempotencyKey: i.idempotencyKey,
        workspaceId: o.identity.workspaceId, shopId, memberId: o.identity.memberId, deviceId: o.identity.deviceId, installationId: scope.installationId,
        senderKind: "device", senderId: o.identity.deviceId, recipientKind: "desktop", recipientId: scope.installationId, messageType: i.kind,
        sequence: i.policyVersion, issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(i.expiresAt).toISOString(), revocationEpoch: scope.revocationEpoch,
        cipherAlgorithm: CONNECTED_CIPHER_ALGORITHM, encryptionKeyId: "desktop-rsa-oaep-v1", signatureAlgorithm: CONNECTED_SIGNATURE_ALGORITHM, signingKeyId: "device-ed25519-v1",
      };
      return JSON.stringify(await sealEnvelopeWeb(metadata, i.payload, o.pinned.rsaPublicJwk, o.keys.signing.privateKey));
    },
    post: (sealedEnvelopeJson: string): Promise<Reply> => send(`${base}/v1/commands`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: sealedEnvelopeJson }),
    status(commandId: string): Promise<Reply> {
      const q = new URLSearchParams({ workspaceId: o.identity.workspaceId, deviceId: o.identity.deviceId });
      return send(`${base}/v1/commands/${encodeURIComponent(commandId)}?${q.toString()}`, { method: "GET", headers });
    },
    async openResult(sealedResult: unknown): Promise<ParsedResult> {
      const opened = await openEnvelopeWeb<unknown>(sealedResult, o.pinned.signingPublicKey, o.keys.encryption.privateKey, { now: o.now(), expect: { recipientId: o.identity.deviceId, deviceId: o.identity.deviceId } });
      if (!opened.ok) return { ok: false, reason: opened.reason };
      const env = opened.envelope; const payload = obj(opened.payload); const result = obj(payload?.result) ?? {};
      if (env.messageType !== "command.result" || !payload) return { ok: false, reason: "bad_payload" };
      const code = typeof result.code === "string" ? result.code : undefined;
      if (payload.state === "committed") return { ok: true, deviceId: env.deviceId, commandId: env.envelopeId, outcome: "committed", ...(result.guarded === true ? { guarded: true } : {}) };
      if (payload.state === "rejected" || payload.state === "conflict") return { ok: true, deviceId: env.deviceId, commandId: env.envelopeId, outcome: code === "EXPIRED" ? "expired" : "failed", ...(code === undefined ? {} : { code }) };
      return { ok: false, reason: "bad_payload" };
    },
  };
}
