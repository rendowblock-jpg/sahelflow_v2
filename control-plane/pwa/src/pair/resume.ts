import { APPROVAL_TIMEOUT_MS } from "../poll/approval";
import type { Db } from "../storage/idb";

// A phone that paired but is not approved yet must find its way back to the "waiting for your PC" screen
// after a reload. The time pairing finished is kept (settings/pairing) so the 10-minute window never restarts.
export type PairingRecord = Readonly<{ pairedAt: number; fingerprint: string }>;
export type Resume =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "waiting"; fingerprint: string; pairedAt: number; elapsedMs: number; remainingMs: number }>
  | Readonly<{ kind: "timeout"; fingerprint: string; pairedAt: number }>;

const NONE: Resume = { kind: "none" };
const usable = (v: unknown): v is PairingRecord => {
  const r = v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
  return !!r && typeof r.pairedAt === "number" && Number.isFinite(r.pairedAt) && r.pairedAt > 0 && typeof r.fingerprint === "string";
};

export async function savePairingRecord(db: Db, record: PairingRecord): Promise<void> {
  await db.put("settings", "pairing", record);
}

export async function readResume(db: Db, now: number, windowMs: number = APPROVAL_TIMEOUT_MS): Promise<Resume> {
  try {
    const [credentials, trusted, device, snapshot, stored] = await Promise.all([
      db.get<unknown>("keys", "credentials"), db.get<unknown>("keys", "desktop"), db.get<unknown>("keys", "device"),
      db.get<unknown>("projections", "last"), db.get<unknown>("settings", "pairing"),
    ]);
    // Approved (a snapshot exists) or not fully paired: nothing to resume.
    if (!credentials || !trusted || !device || snapshot !== undefined) return NONE;
    let record: PairingRecord;
    if (usable(stored) && stored.pairedAt <= now) record = stored;
    else {
      // Paired before the time was stored, or an unusable (future/garbage) value: the window starts now and is kept.
      record = { pairedAt: now, fingerprint: usable(stored) ? stored.fingerprint : "" };
      await db.put("settings", "pairing", record);
    }
    const elapsedMs = now - record.pairedAt;
    if (elapsedMs >= windowMs) return { kind: "timeout", fingerprint: record.fingerprint, pairedAt: record.pairedAt };
    return { kind: "waiting", fingerprint: record.fingerprint, pairedAt: record.pairedAt, elapsedMs, remainingMs: windowMs - elapsedMs };
  } catch { return NONE; }
}
