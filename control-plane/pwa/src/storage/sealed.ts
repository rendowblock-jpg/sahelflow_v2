import { STALE_MS, type ProjectionKind } from "../../../../src/lib/connected-platform/contracts";
import { openEnvelopeWeb } from "../../../../src/lib/connected-platform/web";
import { LOCK_AFTER_MS } from "../lock/state";
import type { Db } from "./idb";

// The envelope AS RECEIVED (still encrypted to this phone's key). The plaintext of orders and chats is never written.
export type SealedRow = Readonly<{ kind: ProjectionKind; envelope: unknown; sequence: number; receivedAt: number; shopId: string }>;
export const putSealed = (db: Db, row: SealedRow): Promise<void> => db.put("sealed", row.kind, row);
export async function getSealed(db: Db, kind: ProjectionKind): Promise<SealedRow | null> {
  const row = await db.get<SealedRow>("sealed", kind);
  return row && typeof row.receivedAt === "number" ? row : null;
}

// At app open: sealed copies and outbox rows older than 24 h (STALE_MS) are deleted. Exactly 24 h stays.
export async function purgeOld(db: Db, now: number): Promise<Readonly<{ sealed: number; outbox: number }>> {
  const sweep = async (store: "sealed" | "outbox", field: "receivedAt" | "createdAt"): Promise<number> => {
    let gone = 0;
    for (const key of await db.keys(store)) {
      const row = await db.get<Record<string, unknown>>(store, key); const at = row?.[field];
      if (typeof at !== "number" || now - at > STALE_MS) { await db.remove(store, key); gone += 1; }
    }
    return gone;
  };
  return { sealed: await sweep("sealed", "receivedAt"), outbox: await sweep("outbox", "createdAt") };
}

// Decrypt into memory only. The projection envelope lives 15 minutes, the offline copy 24 h, so it is opened "as of its
// issue time": the signature, the recipient and the AAD are still checked, and OUR 24 h limit replaces the 15 min one.
export async function openSealed<T>(row: SealedRow, ctx: Readonly<{ signingPublicKey: string; encryptionPrivateKey: CryptoKey; deviceId: string; now: number }>): Promise<T | null> {
  if (ctx.now - row.receivedAt > STALE_MS) return null;
  const issued = Date.parse((row.envelope as { issuedAt?: string } | null)?.issuedAt ?? "");
  if (!Number.isFinite(issued)) return null;
  const opened = await openEnvelopeWeb<T>(row.envelope, ctx.signingPublicKey, ctx.encryptionPrivateKey, { now: issued + 1, expect: { recipientId: ctx.deviceId, deviceId: ctx.deviceId } });
  return opened.ok ? opened.payload : null;
}

// Decrypted copies: in memory only; dropped on lock, and when the app was hidden for LOCK_AFTER_MS or more.
export function createVault() {
  const copies = new Map<string, unknown>(); let hiddenAt: number | null = null;
  return {
    put(key: string, value: unknown): void { copies.set(key, value); },
    get<T>(key: string): T | null { return copies.has(key) ? (copies.get(key) as T) : null; },
    hide(now: number): void { if (hiddenAt === null) hiddenAt = now; },
    show(now: number): void { const at = hiddenAt; hiddenAt = null; if (at !== null && (now < at || now - at >= LOCK_AFTER_MS)) copies.clear(); },
    lock(): void { copies.clear(); hiddenAt = null; },
  };
}
