// The phone swaps its device token for a new one from time to time (W4SEC-05). The relay decides when a swap is due; the phone only
// asks - at launch, on return to the foreground, when back online - and at most twice a day. The request is signed with the phone's own
// signing key (non-extractable, so a stolen token alone can not renew itself).
//
// Rules that keep the seller's phone alive:
//  - Nothing here ever wipes. Any answer but a good 200 means "try later". What a 401 on a poll means is decided by the poll (revoke.ts).
//  - The new token is saved by merging into the credentials as they are NOW (a shop learned by a poll in the meantime is kept) and only if
//    they still belong to the same pairing.
//  - If the answer is lost the phone keeps the old token, which the relay still accepts for a day, and asks again after a few minutes.
import { tokenRotationProofBytes } from "../../../../src/lib/connected-platform/token-rotation-proof";
import { base64Encode, bytesToHex } from "../../../../src/lib/connected-platform/web";
import type { PairingIdentity } from "../pair/pinned";
import { loadDeviceKeys, type Db } from "../storage/idb";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** After a good answer (swapped or "not due") the phone does not ask again for this long. The relay's own clock decides what is due. */
export const ROTATE_CHECK_MIN_GAP_MS = 12 * HOUR_MS;
/** After a failed ask (offline, lost answer, relay error) the phone waits this long before the next one. */
export const ROTATE_RETRY_MIN_GAP_MS = 5 * MINUTE_MS;

export type RotationOutcome = "not_paired" | "recent" | "not_due" | "rotated" | "later";
export type TokenRotationDeps = Readonly<{ getDb(): Promise<Db>; relayBase: string; fetch: typeof fetch; now(): number }>;
// What a usable token looks like: the relay hands out base64url, and refuses a bearer outside 32-256 characters.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,256}$/;

export function createTokenRotation(d: TokenRotationDeps): Readonly<{ check(): Promise<RotationOutcome> }> {
  const base = d.relayBase.replace(/\/+$/, "");
  let inFlight: Promise<RotationOutcome> | null = null;
  let failedAt: number | null = null;

  /** Writes into the credentials as they are now, but only while they still belong to the pairing the request was made for. */
  async function merge(db: Db, sent: PairingIdentity, patch: Readonly<{ deviceToken?: string; tokenCheckedAt: number }>): Promise<boolean> {
    const latest = await db.get<PairingIdentity>("keys", "credentials");
    if (!latest || latest.deviceId !== sent.deviceId || latest.workspaceId !== sent.workspaceId) return false;
    await db.put("keys", "credentials", { ...latest, ...patch });
    return true;
  }

  async function run(): Promise<RotationOutcome> {
    let db: Db; let creds: PairingIdentity | undefined; let keys: Awaited<ReturnType<typeof loadDeviceKeys>>;
    try { db = await d.getDb(); creds = await db.get<PairingIdentity>("keys", "credentials"); keys = await loadDeviceKeys(db); } catch { return "not_paired"; }
    if (!creds || !keys || typeof creds.deviceToken !== "string") return "not_paired";
    const now = d.now();
    if (typeof creds.tokenCheckedAt === "number" && creds.tokenCheckedAt <= now && now - creds.tokenCheckedAt < ROTATE_CHECK_MIN_GAP_MS) return "recent";
    if (failedAt !== null && failedAt <= now && now - failedAt < ROTATE_RETRY_MIN_GAP_MS) return "later";
    const sent = creds;
    const later = (): RotationOutcome => { failedAt = now; return "later"; };
    let signature: string;
    try {
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sent.deviceToken)));
      const proof = tokenRotationProofBytes({ workspaceId: sent.workspaceId, deviceId: sent.deviceId, tokenSha256Hex: bytesToHex(digest), issuedAt: now });
      signature = base64Encode(new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, keys.signing.privateKey, proof as BufferSource)));
    } catch { return later(); }
    let res: Response;
    try {
      res = await d.fetch(`${base}/v1/devices/rotate-token`, {
        method: "POST", headers: { authorization: `Bearer ${sent.deviceToken}`, "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: sent.workspaceId, deviceId: sent.deviceId, issuedAt: now, signature }),
        credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
      });
    } catch { return later(); }
    if (res.status !== 200) return later();
    const body: unknown = await res.json().catch(() => null);
    const answer = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (!answer) return later();
    try {
      if (answer.rotated === false) { await merge(db, sent, { tokenCheckedAt: now }); failedAt = null; return "not_due"; }
      if (answer.rotated === true && typeof answer.deviceToken === "string" && TOKEN_SHAPE.test(answer.deviceToken)) {
        if (!(await merge(db, sent, { deviceToken: answer.deviceToken, tokenCheckedAt: now }))) return later();
        failedAt = null; return "rotated";
      }
    } catch { return later(); }
    return later();
  }

  return { check(): Promise<RotationOutcome> { inFlight ??= run().finally(() => { inFlight = null; }); return inFlight; } };
}
