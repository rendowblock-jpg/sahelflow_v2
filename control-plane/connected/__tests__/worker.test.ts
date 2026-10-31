// The relay worker, end to end: real SQL (node:sqlite), real Ed25519, worker.fetch().
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PWA_ORIGIN, SHOP_ID, WORKSPACE_ID, createWorld, type Device, type World } from "./harness";
import { createTestD1 } from "./d1-sqlite";

const MINUTE = 60_000;
const JWK = JSON.stringify({ kty: "RSA", n: "x".repeat(64), e: "AQAB" });
const KEY_B64 = Buffer.alloc(32, 7).toString("base64");
const PAIRING = (_world: World, created: { body: Record<string, string> }) => ({
  pairingId: created.body.pairingId ?? "",
  pairingToken: created.body.pairingToken ?? "",
});

afterEach(() => vi.useRealTimers());

/** Freeze Date inside the NEXT minute (so SQL's real clock is never ahead of it). */
function freeze(secondIntoMinute = 20) {
  const minute = Math.floor(Date.now() / MINUTE) * MINUTE + MINUTE;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(minute + secondIntoMinute * 1000);
}
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

const probeExchange = (world: World, i: number, ip: string, headers: Record<string, string> = {}) =>
  world.call("/v1/pairings/exchange", {
    method: "POST",
    headers: { "CF-Connecting-IP": ip, ...headers },
    body: {
      pairingId: `pair_probe_${String(i).padStart(4, "0")}`,
      pairingToken: "t".repeat(43),
      signingPublicKey: KEY_B64,
      encryptionPublicKey: JWK,
    },
  });

const projectionUrl = (device: Device, extra = "") =>
  `/v1/projections?workspaceId=${WORKSPACE_ID}&deviceId=${device.deviceId}&shopId=${SHOP_ID}&type=dashboard${extra}`;

describe("pairing", () => {
  it("exchanges a pairing once and refuses the replay", async () => {
    const w = await createWorld();
    const created = await w.createPairing("device_aaaa01", "member_owner");
    expect(created.response.status).toBe(201);
    const key = await w.generateSigningKey();
    const first = await w.exchange(PAIRING(w, created), key);
    expect(first.status).toBe(201);
    const issued = (await first.json()) as Record<string, unknown>;
    expect(issued.deviceId).toBe("device_aaaa01");
    expect(issued.memberId).toBe("member_owner");
    expect(typeof issued.deviceToken).toBe("string");
    const replay = await w.exchange(PAIRING(w, created), key);
    expect(replay.status).toBe(403);
    expect(await replay.json()).toEqual({ error: "pairing_rejected" });
    expect(w.count("SELECT COUNT(*) AS n FROM connected_device")).toBe(1);
  });

  it("refuses a wrong token and an expired pairing", async () => {
    const w = await createWorld();
    const created = await w.createPairing("device_aaaa02", "member_owner");
    const key = await w.generateSigningKey();
    const wrong = await w.exchange({ ...PAIRING(w, created), pairingToken: "w".repeat(43) }, key);
    expect(wrong.status).toBe(403);
    w.d1.sqlite.exec("UPDATE connected_pairing SET expires_at = '2020-01-01T00:00:00.000Z'");
    const expired = await w.exchange(PAIRING(w, created), key);
    expect(expired.status).toBe(403);
    expect(w.count("SELECT COUNT(*) AS n FROM connected_device")).toBe(0);
  });

  it("stops a second pairing for a device that is already paired", async () => {
    const w = await createWorld();
    const device = await w.pair("device_aaaa03");
    const again = await w.createPairing(device.deviceId, device.memberId);
    expect(again.response.status).toBe(403);
  });

  it("refuses a new member once the member limit is reached", async () => {
    const w = await createWorld({ memberLimit: 1, deviceLimit: 3 });
    await w.pair("device_aaaa04", "member_one");
    const second = await w.createPairing("device_aaaa05", "member_two");
    expect(second.response.status).toBe(403);
    expect(second.body.error).toBe("entitlement_limit_reached");
    const sameMember = await w.createPairing("device_aaaa06", "member_one");
    expect(sameMember.response.status).toBe(201);
  });

  it("race: two exchanges at the device limit admit exactly one", async () => {
    const w = await createWorld({ deviceLimit: 2, yieldBetween: true });
    const a = await w.createPairing("device_race_a", "member_a");
    const b = await w.createPairing("device_race_b", "member_b");
    w.d1.sqlite.exec("UPDATE connected_workspace SET device_limit = 1");
    const keys = [await w.generateSigningKey(), await w.generateSigningKey()] as const;
    const results = await Promise.all([
      w.exchange(PAIRING(w, a), keys[0]),
      w.exchange(PAIRING(w, b), keys[1]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    const loser = results.find((r) => r.status === 403);
    expect(await loser?.json()).toEqual({ error: "entitlement_limit_reached" });
    expect(w.count("SELECT COUNT(*) AS n FROM connected_device")).toBe(1);
  });

  it("race: two exchanges at the member limit admit exactly one member", async () => {
    const w = await createWorld({ memberLimit: 2, deviceLimit: 5, yieldBetween: true });
    const a = await w.createPairing("device_mrace_a", "member_a");
    const b = await w.createPairing("device_mrace_b", "member_b");
    w.d1.sqlite.exec("UPDATE connected_workspace SET member_limit = 1");
    const results = await Promise.all([
      w.exchange(PAIRING(w, a), await w.generateSigningKey()),
      w.exchange(PAIRING(w, b), await w.generateSigningKey()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
    expect(w.count("SELECT COUNT(DISTINCT member_id) AS n FROM connected_device")).toBe(1);
  });
});

describe("commands", () => {
  it("queues a signed command and answers a replay with the same id", async () => {
    const w = await createWorld();
    const device = await w.pair();
    w.allowCommands(device);
    const envelope = await w.commandEnvelope(device);
    const first = await w.submit(device, envelope);
    expect(first.status).toBe(202);
    const queued = (await first.json()) as { commandId: string; state: string };
    expect(queued).toMatchObject({ commandId: envelope.envelopeId, state: "queued" });
    const replay = await w.submit(device, envelope);
    expect(replay.status).toBe(200);
    expect((await replay.json()) as { commandId: string }).toMatchObject({ commandId: envelope.envelopeId });
    expect(w.count("SELECT COUNT(*) AS n FROM connected_command")).toBe(1);
  });

  it("refuses the same idempotency key with a different command", async () => {
    const w = await createWorld();
    const device = await w.pair();
    w.allowCommands(device);
    const first = await w.commandEnvelope(device);
    await w.submit(device, first);
    const other = await w.commandEnvelope(device, { idempotencyKey: first.idempotencyKey });
    const response = await w.submit(device, other);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "idempotency_conflict" });
  });

  it.each([
    ["wrong member epoch", {}, { revocationEpoch: 1 }],
    ["sequence is not the policy version", {}, { sequence: 2 }],
    ["expired policy", { ttlMs: -1_000 }, {}],
    ["device epoch moved", { deviceEpoch: 1 }, {}],
    ["command outside the policy", {}, { messageType: "command.orders.decision" }],
  ])("refuses: %s", async (_label, policy, fields) => {
    const w = await createWorld();
    const device = await w.pair();
    w.allowCommands(device, policy);
    const response = await w.submit(device, await w.commandEnvelope(device, fields));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "command_not_authorized" });
    expect(w.count("SELECT COUNT(*) AS n FROM connected_command")).toBe(0);
  });

  it("refuses a command signed by another key", async () => {
    const w = await createWorld();
    const device = await w.pair();
    w.allowCommands(device);
    const stranger = await w.generateSigningKey();
    const envelope = await w.commandEnvelope({ ...device, key: stranger });
    const response = await w.submit(device, envelope);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "invalid_signature" });
  });

  it("keeps devices apart: no cross-device submit, read or member swap", async () => {
    const w = await createWorld();
    const a = await w.pair();
    const b = await w.pair();
    w.allowCommands(a);
    w.allowCommands(b);
    expect((await w.submit(a, await w.commandEnvelope(b))).status).toBe(401);
    expect((await w.submit(a, await w.commandEnvelope(a, { memberId: "member_other" }))).status).toBe(401);
    await w.putProjection(await w.projectionEnvelope(b, { sequence: 3 }));
    expect((await w.call(projectionUrl(b), { token: a.token })).status).toBe(401);
    expect((await w.call(projectionUrl(b), { token: w.desktopToken })).status).toBe(401);
    expect((await w.call(projectionUrl(b), { token: b.token })).status).toBe(200);
    expect(w.count("SELECT COUNT(*) AS n FROM connected_command")).toBe(0);
  });
});

describe("revoke", () => {
  it("kills the device token, drops its projection and revokes queued commands", async () => {
    const w = await createWorld();
    const device = await w.pair();
    w.allowCommands(device);
    await w.submit(device, await w.commandEnvelope(device));
    await w.putProjection(await w.projectionEnvelope(device, { sequence: 1 }));
    const unauthorised = await w.call(`/v1/desktop/devices/${device.deviceId}/revoke`, {
      method: "POST",
      token: "x".repeat(40),
      body: { workspaceId: WORKSPACE_ID, revocationEpoch: 1 },
    });
    expect(unauthorised.status).toBe(401);
    const revoked = await w.revoke(device.deviceId, 1);
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ deviceId: device.deviceId, status: "revoked", revocationEpoch: 1 });
    expect((await w.submit(device, await w.commandEnvelope(device, { revocationEpoch: 0 }))).status).toBe(401);
    expect((await w.getProjection(device)).status).toBe(401);
    expect(w.count("SELECT COUNT(*) AS n FROM connected_projection")).toBe(0);
    expect(w.count("SELECT COUNT(*) AS n FROM connected_command WHERE state = 'revoked'")).toBe(1);
    expect((await w.revoke(device.deviceId, 1)).status).toBe(409);
    expect((await w.revoke("device_unknown", 1)).status).toBe(404);
  });

  it("race: a command submitted while the device is revoked never stays queued", async () => {
    const w = await createWorld({ yieldBetween: true });
    const device = await w.pair();
    w.allowCommands(device);
    const envelope = await w.commandEnvelope(device);
    const [submitted, revoked] = await Promise.all([w.submit(device, envelope), w.revoke(device.deviceId, 1)]);
    expect(revoked.status).toBe(200);
    expect([202, 401, 403]).toContain(submitted.status);
    expect(
      w.count("SELECT COUNT(*) AS n FROM connected_command WHERE device_id = ? AND state = 'queued'", device.deviceId),
    ).toBe(0);
  });
});

describe("projection", () => {
  it("stores, serves, answers 304 when unchanged and 404 after expiry", async () => {
    const w = await createWorld();
    const device = await w.pair();
    const envelope = await w.projectionEnvelope(device, { sequence: 5 });
    const put = await w.putProjection(envelope);
    expect(put.status).toBe(202);
    expect(await put.json()).toEqual({ status: "stored", sequence: 5 });
    expect((await w.putProjection(await w.projectionEnvelope(device, { sequence: 5 }))).status).toBe(409);
    expect((await w.putProjection(await w.projectionEnvelope(device, { sequence: 4 }))).status).toBe(409);

    const full = await w.getProjection(device);
    expect(full.status).toBe(200);
    expect(await full.json()).toEqual(envelope);
    const etag = `W/"${device.deviceId}.dashboard.5"`;
    expect(full.headers.get("ETag")).toBe(etag);

    const same = await w.getProjection(device, "&sinceSequence=5");
    expect(same.status).toBe(304);
    expect(await same.text()).toBe("");
    expect(same.headers.get("ETag")).toBe(etag);
    expect((await w.getProjection(device, "&sinceSequence=9")).status).toBe(304);
    expect((await w.getProjection(device, "&sinceSequence=4")).status).toBe(200);
    expect((await w.getProjection(device, "&sinceSequence=0")).status).toBe(200);
    for (const bad of ["abc", "-1", "1.5", ""]) {
      expect((await w.getProjection(device, `&sinceSequence=${bad}`)).status).toBe(400);
    }

    expect((await w.getProjection(device, "", { "If-None-Match": etag })).status).toBe(304);
    expect((await w.getProjection(device, "", { "If-None-Match": `"zzz", ${etag}` })).status).toBe(304);
    expect((await w.getProjection(device, "", { "If-None-Match": "*" })).status).toBe(304);
    expect((await w.getProjection(device, "", { "If-None-Match": `W/"${device.deviceId}.dashboard.4"` })).status).toBe(200);

    w.d1.sqlite.exec("UPDATE connected_projection SET expires_at = '2020-01-01T00:00:00.000Z'");
    expect((await w.getProjection(device, "&sinceSequence=5")).status).toBe(404);
    expect((await w.getProjection(device)).status).toBe(404);
  });
});

describe("CORS", () => {
  const ORIGINS = `${PWA_ORIGIN},http://localhost:4420`;

  it("answers an allowed origin with its own origin and Vary on every response", async () => {
    const w = await createWorld({ pwaOrigins: ORIGINS });
    for (const [pathAndQuery, status] of [["/healthz", 200], ["/v1/projections", 400], ["/nope", 404]] as const) {
      const response = await w.call(pathAndQuery, { headers: { Origin: PWA_ORIGIN } });
      expect(response.status).toBe(status);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(PWA_ORIGIN);
      expect(response.headers.get("Vary")).toMatch(/\bOrigin\b/);
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    }
    const post = await w.call("/v1/pairings/exchange", { method: "POST", headers: { Origin: PWA_ORIGIN }, body: {} });
    expect(post.status).toBe(400);
    expect(post.headers.get("Access-Control-Allow-Origin")).toBe(PWA_ORIGIN);
  });

  it("gives a disallowed origin NO CORS headers and the normal body", async () => {
    const w = await createWorld({ pwaOrigins: ORIGINS });
    for (const origin of ["https://evil.example", "null", `${PWA_ORIGIN}.evil.example`, "http://localhost:4421"]) {
      const response = await w.call("/healthz", { headers: { Origin: origin } });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ status: "ok" });
      expect([...response.headers.keys()].filter((name) => name.startsWith("access-control"))).toEqual([]);
      expect(response.headers.get("Vary")).toMatch(/\bOrigin\b/);
    }
  });

  it("keeps the desktop (no Origin) unchanged, still with Vary", async () => {
    const w = await createWorld({ pwaOrigins: ORIGINS });
    const response = await w.call("/healthz");
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toMatch(/\bOrigin\b/);
    const options = await w.call("/v1/commands", { method: "OPTIONS" });
    expect(options.status).toBe(404);
  });

  it("answers a preflight 204 for an allowed origin only", async () => {
    const w = await createWorld({ pwaOrigins: ORIGINS });
    const headers = {
      Origin: PWA_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    };
    const ok = await w.call("/v1/commands", { method: "OPTIONS", headers });
    expect(ok.status).toBe(204);
    expect(await ok.text()).toBe("");
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(PWA_ORIGIN);
    expect(ok.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    expect(ok.headers.get("Access-Control-Allow-Headers")).toBe("Authorization, Content-Type");
    expect(ok.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(ok.headers.get("Vary")).toMatch(/\bOrigin\b/);

    const denied = await w.call("/v1/commands", { method: "OPTIONS", headers: { ...headers, Origin: "https://evil.example" } });
    expect(denied.status).toBe(403);
    expect(await denied.text()).toBe("");
    expect([...denied.headers.keys()].filter((name) => name.startsWith("access-control"))).toEqual([]);
    expect(denied.headers.get("Vary")).toMatch(/\bOrigin\b/);
  });

  it("allows nothing when PWA_ORIGINS is unset or only a wildcard", async () => {
    for (const pwaOrigins of [undefined, "", "*"]) {
      const w = await createWorld({ pwaOrigins });
      const get = await w.call("/healthz", { headers: { Origin: PWA_ORIGIN } });
      expect(get.headers.get("Access-Control-Allow-Origin")).toBeNull();
      const pre = await w.call("/v1/commands", { method: "OPTIONS", headers: { Origin: PWA_ORIGIN } });
      expect(pre.status).toBe(403);
    }
  });
});

describe("rate limits", () => {
  it("exchange: 10 a minute per IP, then 429 with Retry-After, then the next window", async () => {
    freeze(20);
    const w = await createWorld({ pwaOrigins: PWA_ORIGIN });
    for (let i = 0; i < 10; i += 1) {
      expect((await probeExchange(w, i, "198.51.100.1")).status).toBe(403);
    }
    const limited = await probeExchange(w, 10, "198.51.100.1", { Origin: PWA_ORIGIN });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("40");
    expect(limited.headers.get("Access-Control-Allow-Origin")).toBe(PWA_ORIGIN);
    expect(await limited.json()).toEqual({ error: "rate_limited", scope: "exchange_ip", retryAfterSeconds: 40 });
    expect((await probeExchange(w, 11, "198.51.100.2")).status).toBe(403);
    advance(39_000);
    expect((await probeExchange(w, 12, "198.51.100.1")).status).toBe(429);
    advance(1_000);
    expect((await probeExchange(w, 13, "198.51.100.1")).status).toBe(403);
    const stored = w.rows<{ subject: string }>("SELECT subject FROM connected_rate_limit");
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((row) => !row.subject.includes("198.51.100"))).toBe(true);
  });

  it("exchange: 5 failures on one pairing lock it, even for the right token, until the next minute", async () => {
    freeze(10);
    const w = await createWorld();
    const created = await w.createPairing("device_lock_01", "member_owner");
    const key = await w.generateSigningKey();
    const good = PAIRING(w, created);
    for (let i = 1; i <= 5; i += 1) {
      const wrong = await w.exchange({ ...good, pairingToken: `w${i}`.repeat(20) }, key, { "CF-Connecting-IP": `198.51.100.${i}` });
      expect(wrong.status).toBe(403);
    }
    const locked = await w.exchange(good, key, { "CF-Connecting-IP": "198.51.100.9" });
    expect(locked.status).toBe(429);
    expect(locked.headers.get("Retry-After")).toBe("50");
    expect(await locked.json()).toEqual({ error: "rate_limited", scope: "exchange_pairing_failure", retryAfterSeconds: 50 });
    expect(w.count("SELECT COUNT(*) AS n FROM connected_device")).toBe(0);
    advance(50_000);
    expect((await w.exchange(good, key, { "CF-Connecting-IP": "198.51.100.9" })).status).toBe(201);
  });

  it("submit: 30 a minute per device; another device and the next window are free", async () => {
    freeze(20);
    const w = await createWorld({ pwaOrigins: PWA_ORIGIN });
    const a = await w.pair();
    const b = await w.pair();
    w.allowCommands(a);
    w.allowCommands(b);
    const envelope = await w.commandEnvelope(a);
    for (let i = 0; i < 30; i += 1) {
      expect((await w.submit(a, envelope)).status).toBe(i === 0 ? 202 : 200);
    }
    const limited = await w.submit(a, envelope, { Origin: PWA_ORIGIN });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("40");
    expect(limited.headers.get("Access-Control-Allow-Origin")).toBe(PWA_ORIGIN);
    expect(await limited.json()).toEqual({ error: "rate_limited", scope: "command_submit", retryAfterSeconds: 40 });
    expect((await w.submit(b, await w.commandEnvelope(b))).status).toBe(202);
    advance(40_000);
    expect((await w.submit(a, envelope)).status).toBe(200);
  });

  it("projection GET: 60 a minute per device", async () => {
    freeze(20);
    const w = await createWorld();
    const a = await w.pair();
    const b = await w.pair();
    for (let i = 0; i < 60; i += 1) {
      expect((await w.getProjection(a)).status).toBe(404);
    }
    const limited = await w.getProjection(a);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("40");
    expect(await limited.json()).toEqual({ error: "rate_limited", scope: "projection_get", retryAfterSeconds: 40 });
    expect((await w.getProjection(b)).status).toBe(404);
    advance(40_000);
    expect((await w.getProjection(a)).status).toBe(404);
  });

  it("prunes at most 100 rows older than ten minutes per request that opens a window", async () => {
    freeze(20);
    const w = await createWorld();
    const now = Date.now();
    const insert = w.d1.sqlite.prepare(
      "INSERT INTO connected_rate_limit (bucket, subject, window_start, count) VALUES ('exchange_ip', ?, ?, 1)",
    );
    for (let i = 0; i < 150; i += 1) insert.run(`old${i}`, now - 20 * MINUTE);
    for (let i = 0; i < 3; i += 1) insert.run(`recent${i}`, now - 5 * MINUTE);
    const old = () => w.count("SELECT COUNT(*) AS n FROM connected_rate_limit WHERE window_start < ?", now - 10 * MINUTE);
    await probeExchange(w, 1, "198.51.100.1");
    expect(old()).toBe(50);
    await probeExchange(w, 2, "198.51.100.2");
    expect(old()).toBe(0);
    expect(w.count("SELECT COUNT(*) AS n FROM connected_rate_limit WHERE subject LIKE 'recent%'")).toBe(3);
    const before = w.count("SELECT COUNT(*) AS n FROM connected_rate_limit");
    await probeExchange(w, 2, "198.51.100.2");
    expect(w.count("SELECT COUNT(*) AS n FROM connected_rate_limit")).toBe(before);
  });

  it("fails open (and says so on /healthz) when the counter table is missing", async () => {
    const w = await createWorld();
    w.d1.sqlite.exec("DROP TABLE connected_rate_limit");
    expect((await probeExchange(w, 1, "198.51.100.1")).status).toBe(403);
    const device = await w.pair();
    expect((await w.getProjection(device)).status).toBe(404);
    expect((await w.call("/healthz")).status).toBe(503);
  });

  it("migration 0002 alone creates the same table as schema.sql", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const fromMigration = createTestD1();
    fromMigration.sqlite.exec(readFileSync(path.join(here, "..", "migrations", "0002_rate_limits.sql"), "utf8"));
    const fromSchema = createTestD1();
    fromSchema.sqlite.exec(readFileSync(path.join(here, "..", "schema.sql"), "utf8"));
    const info = (db: ReturnType<typeof createTestD1>) =>
      db.sqlite.prepare("PRAGMA table_info(connected_rate_limit)").all();
    expect(info(fromMigration).length).toBeGreaterThanOrEqual(4);
    expect(info(fromMigration)).toEqual(info(fromSchema));
  });
});

describe("last_seen_at", () => {
  it("is written at most once per 30 seconds per device, in one statement", async () => {
    const w = await createWorld();
    const device = await w.pair();
    const before = w.lastSeenWrites();
    for (let i = 0; i < 5; i += 1) await w.getProjection(device);
    expect(w.lastSeenWrites() - before).toBe(1);
    w.d1.sqlite.exec("UPDATE connected_device SET last_seen_at = datetime('now', '-29 seconds')");
    await w.getProjection(device);
    expect(w.lastSeenWrites() - before).toBe(1);
    w.d1.sqlite.exec("UPDATE connected_device SET last_seen_at = datetime('now', '-31 seconds')");
    await w.getProjection(device);
    expect(w.lastSeenWrites() - before).toBe(2);
    const stamps = w.d1.log.filter((entry) => entry.kind === "run" && entry.sql.includes("last_seen_at"));
    expect(stamps.every((entry) => entry.sql.includes("WHERE"))).toBe(true);
  });
});
