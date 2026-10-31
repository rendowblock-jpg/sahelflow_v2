import { openEnvelopeWeb } from "../../../../src/lib/connected-platform/web";
import type { PairingIdentity, TrustedDesktop } from "../pair/pinned";
import { loadDeviceKeys, type Db } from "../storage/idb";
import type { DayCount, Projection, ProjectionResult, ProjectionSource } from "./projection";

export type Snapshot = Readonly<{ sequence: number; receivedAt: number; shopId?: string; projection: Projection }>;
export type RelayPoll =
  | Readonly<{ kind: "updated"; snapshot: Snapshot }>
  | Readonly<{ kind: "unchanged" }>
  | Readonly<{ kind: "pending" }>
  | Readonly<{ kind: "revoked" }>
  | Readonly<{ kind: "pcoff" }>
  | Readonly<{ kind: "rate_limited"; retryAfterMs: number }>
  | Readonly<{ kind: "server" }>
  | Readonly<{ kind: "refused"; reason: string }>
  | Readonly<{ kind: "network" }>
  | Readonly<{ kind: "not_paired" }>;

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const count = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

// The desktop's dashboard payload -> what Today shows. Orders waiting: stats.ordersWaiting when the desktop sends the
// exact total; else a FLOOR counted from the few recent orders (status is a plain string on the desktop, "pending" = waiting
// for confirmation, matched exactly) and flagged so the view says "at least". whatsappHeld / codToCollectDzd: only when sent.
export function parseDashboard(payload: unknown, generatedAt: number): Projection | null {
  const root = obj(payload); const stats = obj(root?.stats);
  if (!root || !stats || !Number.isFinite(generatedAt)) return null;
  const newOrders = count(stats.ordersToday);
  if (newOrders === null) return null;
  const recent: readonly unknown[] = Array.isArray(root.recentOrders) ? root.recentOrders : [];
  const exact = count(stats.ordersWaiting);
  const toConfirm = exact ?? recent.filter((o) => obj(o)?.status === "pending").length;
  const rawSeries = obj(root.analytics)?.revenueSeries;
  const series: readonly unknown[] = Array.isArray(rawSeries) ? rawSeries : [];
  const week: DayCount[] = [];
  for (const item of series.slice(-7)) {
    const row = obj(item); const at = typeof row?.date === "string" ? Date.parse(row.date) : Number.NaN; const orders = count(row?.orders);
    if (Number.isFinite(at) && orders !== null) week.push({ at, orders });
  }
  // Cash to collect is whole DZD; absent or unusable = NaN, which the view prints as a dash.
  // The command authority the desktop published with it: which policy version a command must be sealed with, and until when it holds.
  const auth = obj(root.connectedCommandAuthority); const policyVersion = count(auth?.policyVersion); const authUntil = typeof auth?.expiresAt === "string" ? Date.parse(auth.expiresAt) : Number.NaN;
  const authority = policyVersion !== null && Number.isFinite(authUntil) ? { authority: { policyVersion, expiresAt: authUntil } } : {};
  return { ...authority, generatedAt, newOrders, toConfirm, toConfirmIsFloor: exact === null, inDelivery: count(stats.pendingDeliveries) ?? 0, codToCollectDzd: count(stats.codToCollectDzd) ?? Number.NaN, week, whatsappHeld: count(stats.whatsappHeld) };
}

// 429 Retry-After is seconds; absent or unusable = one minute. Never more than an hour.
const retryAfter = (res: Response): number => { const s = Number(res.headers.get("retry-after")); return Number.isFinite(s) && s > 0 ? Math.min(Math.ceil(s) * 1000, 3_600_000) : 60_000; };
const validShopId = (v: unknown): v is string => typeof v === "string" && /^[^\s\u0000-\u001f]{1,128}$/.test(v);
// The relay's 409 shop_required body: { error, shops: [ids sorted] }. Only the first id is used.
async function firstListedShop(res: Response): Promise<string | null> {
  const body = obj(await res.json().catch(() => null)); const raw = body?.shops;
  const list: readonly unknown[] = Array.isArray(raw) ? raw : [];
  const first = list[0];
  return validShopId(first) ? first : null;
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
    const me: PairingIdentity = identity; const pinned: TrustedDesktop = trusted; const stored = me.shopId; const lastSnap = isSnapshot(last) ? last : null;
    // The replay baseline belongs to ONE shop: another shop starts again from its own sequence.
    const baseline = (shop: string): number => (lastSnap && (lastSnap.shopId === undefined || lastSnap.shopId === shop) ? lastSnap.sequence : 0);
    // sinceSequence (not If-None-Match: the CORS allow-list omits it) -> 304 when nothing is newer.
    // Without a stored shop the phone asks for everything (since 0) so the answer can be verified and the shop learned from it.
    const ask = async (shop: string | null, since: number): Promise<Response | null> => {
      const query = new URLSearchParams({ workspaceId: me.workspaceId, deviceId: me.deviceId, type: "dashboard", sinceSequence: String(since) });
      if (shop) query.set("shopId", shop);
      try {
        return await (options.fetchImpl ?? fetch)(`${base}/v1/projections?${query.toString()}`, {
          headers: { authorization: `Bearer ${me.deviceToken}` }, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
        });
      } catch { return null; }
    };
    let asked: string | null = stored; let res = await ask(stored, stored ? baseline(stored) : 0);
    // Two live shops: the relay lists them sorted; v1 shows ONE shop, the first, asked for once.
    if (res && res.status === 409 && !stored) {
      const chosen = await firstListedShop(res);
      if (!chosen) return { kind: "refused", reason: "shop_required" };
      asked = chosen; res = await ask(chosen, 0);
    }
    if (!res) return { kind: "network" };
    if (res.status === 404) {
      if (!stored) return { kind: "pending" };
      // The PC is off for more than 15 minutes: the relay has no fresh copy. The shop is NOT forgotten (with two shops it could flip silently).
      return { kind: "pcoff" };
    }
    if (res.status === 401 || res.status === 403) return { kind: "revoked" };
    if (res.status === 429) return { kind: "rate_limited", retryAfterMs: retryAfter(res) };
    if (res.status >= 500) return { kind: "server" };
    if (res.status === 304) return stored ? { kind: "unchanged" } : { kind: "network" };
    if (!res.ok) return { kind: "network" };
    const body: unknown = await res.json().catch(() => null);
    const now = clock();
    // The pinned signing key (checked at pairing) and this phone's own RSA key open it; a sequence that goes backwards is refused.
    const opened = await openEnvelopeWeb<unknown>(body, pinned.signingPublicKey, keys.encryption.privateKey, {
      now, expect: { recipientId: me.deviceId, deviceId: me.deviceId, minSequence: stored ? baseline(stored) + 1 : 0 },
    });
    if (!opened.ok) return { kind: "refused", reason: opened.reason };
    const env = opened.envelope;
    // The shop is the stored one, or the one the relay listed; with neither, the verified envelope names it.
    if (env.workspaceId !== me.workspaceId || env.memberId !== me.memberId || !validShopId(env.shopId) || (asked !== null && env.shopId !== asked)) return { kind: "refused", reason: "wrong_scope" };
    const discovering = stored === null; const known = baseline(env.shopId);
    if (discovering && env.sequence < known) return { kind: "refused", reason: "stale_sequence" };
    if (discovering) {
      try { await db.put("keys", "credentials", { ...me, shopId: env.shopId }); } catch { return { kind: "refused", reason: "storage" }; }
      if (env.sequence === known && known > 0) return { kind: "unchanged" };
    }
    const projection = parseDashboard(opened.payload, Date.parse(env.issuedAt));
    if (!projection) return { kind: "refused", reason: "payload" };
    const snapshot: Snapshot = { sequence: env.sequence, receivedAt: now, shopId: env.shopId, projection };
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
