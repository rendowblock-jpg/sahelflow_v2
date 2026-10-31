import { openEnvelopeWeb } from "../../../../src/lib/connected-platform/web";
import type { PairingIdentity, TrustedDesktop } from "../pair/pinned";
import { loadDeviceKeys, type Db } from "../storage/idb";
import type { DayCount, Projection, ProjectionResult, ProjectionSource } from "./projection";

export type Snapshot = Readonly<{ sequence: number; receivedAt: number; projection: Projection }>;
export type RelayPoll =
  | Readonly<{ kind: "updated"; snapshot: Snapshot }>
  | Readonly<{ kind: "unchanged" }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "revoked" }>
  | Readonly<{ kind: "refused"; reason: string }>
  | Readonly<{ kind: "network" }>
  | Readonly<{ kind: "not_paired" }>;

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

// The desktop's dashboard payload -> what Today shows. "Waiting" is counted from the
// recent orders the desktop sends; whatsappHeld is shown only when the desktop sends it.
export function parseDashboard(payload: unknown, generatedAt: number): Projection | null {
  const root = obj(payload); const stats = obj(root?.stats);
  if (!root || !stats || !Number.isFinite(generatedAt)) return null;
  const newOrders = count(stats.ordersToday);
  if (newOrders === null) return null;
  const recent: readonly unknown[] = Array.isArray(root.recentOrders) ? root.recentOrders : [];
  const toConfirm = recent.filter((o) => String(obj(o)?.status ?? "").toLowerCase() === "pending").length;
  const rawSeries = obj(root.analytics)?.revenueSeries;
  const series: readonly unknown[] = Array.isArray(rawSeries) ? rawSeries : [];
  const week: DayCount[] = [];
  for (const item of series.slice(-7)) {
    const row = obj(item); const at = typeof row?.date === "string" ? Date.parse(row.date) : Number.NaN; const orders = count(row?.orders);
    if (Number.isFinite(at) && orders !== null) week.push({ at, orders });
  }
  // The desktop does not publish cash-on-delivery to collect yet: NaN is shown as a dash.
  return { generatedAt, newOrders, toConfirm, inDelivery: count(stats.pendingDeliveries) ?? 0, codToCollectDzd: Number.NaN, week, whatsappHeld: count(stats.whatsappHeld) };
}

const isSnapshot = (v: unknown): v is Snapshot => {
  const s = obj(v); const p = obj(s?.projection);
  return !!s && !!p && typeof s.sequence === "number" && typeof s.receivedAt === "number" && typeof p.generatedAt === "number";
};

export function createRelayClient(options: Readonly<{ baseUrl: string; getDb: () => Promise<Db>; fetchImpl?: typeof fetch; now?: () => number }>): Readonly<{ poll(): Promise<RelayPoll>; source: ProjectionSource }> {
  const base = options.baseUrl.replace(/\/+$/, ""); const clock = options.now ?? Date.now;
  async function poll(): Promise<RelayPoll> {
    let db: Db;
    try { db = await options.getDb(); } catch { return { kind: "not_paired" }; }
    let identity: PairingIdentity | undefined; let trusted: TrustedDesktop | undefined; let last: unknown; let keys: Awaited<ReturnType<typeof loadDeviceKeys>>;
    try {
      identity = await db.get<PairingIdentity>("keys", "credentials"); trusted = await db.get<TrustedDesktop>("keys", "desktop");
      last = await db.get<Snapshot>("projections", "last"); keys = await loadDeviceKeys(db);
    } catch { return { kind: "not_paired" }; }
    if (!identity || !trusted || !keys) return { kind: "not_paired" };
    if (!identity.shopId) return { kind: "refused", reason: "no_shop" };
    const lastSequence = isSnapshot(last) ? last.sequence : 0;
    // sinceSequence (not If-None-Match: the CORS allow-list omits it) -> 304 when nothing is newer.
    const query = new URLSearchParams({ workspaceId: identity.workspaceId, deviceId: identity.deviceId, shopId: identity.shopId, type: "dashboard", sinceSequence: String(lastSequence) });
    let res: Response;
    try {
      res = await (options.fetchImpl ?? fetch)(`${base}/v1/projections?${query.toString()}`, {
        headers: { authorization: `Bearer ${identity.deviceToken}` }, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
      });
    } catch { return { kind: "network" }; }
    if (res.status === 404) return { kind: "pending" };
    if (res.status === 304) return { kind: "unchanged" };
    if (res.status === 401 || res.status === 403) return { kind: "revoked" };
    if (!res.ok) return { kind: "network" };
    const body: unknown = await res.json().catch(() => null);
    const now = clock();
    // The pinned signing key (checked at pairing) and this phone's own RSA key open it; a sequence that goes backwards is refused.
    const opened = await openEnvelopeWeb<unknown>(body, trusted.signingPublicKey, keys.encryption.privateKey, {
      now, expect: { recipientId: identity.deviceId, deviceId: identity.deviceId, minSequence: lastSequence + 1 },
    });
    if (!opened.ok) return { kind: "refused", reason: opened.reason };
    const env = opened.envelope;
    if (env.workspaceId !== identity.workspaceId || env.shopId !== identity.shopId || env.memberId !== identity.memberId) return { kind: "refused", reason: "wrong_scope" };
    const projection = parseDashboard(opened.payload, Date.parse(env.issuedAt));
    if (!projection) return { kind: "refused", reason: "payload" };
    const snapshot: Snapshot = { sequence: env.sequence, receivedAt: now, projection };
    try { await db.put("projections", "last", snapshot); } catch { return { kind: "refused", reason: "storage" }; }
    return { kind: "updated", snapshot };
  }
  const source: ProjectionSource = {
    async load(): Promise<ProjectionResult> {
      let snap: unknown;
      try { snap = await (await options.getDb()).get<Snapshot>("projections", "last"); } catch { return { ok: false, reason: "unreadable" }; }
      if (snap === undefined) return { ok: false, reason: "none" };
      return isSnapshot(snap) ? { ok: true, projection: snap.projection } : { ok: false, reason: "unreadable" };
    },
  };
  return { poll, source };
}
