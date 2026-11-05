// W4SEC-05: the phone token has a lifetime, is swapped for a new one by a phone that proves it holds its signing key,
// and an old paired phone keeps working through the rollout. Real worker, real SQL (node:sqlite), real Ed25519.
// The numbers are written out here ON PURPOSE: changing one of them in device-token.ts must fail a test.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PWA_ORIGIN, WORKSPACE_ID, createWorld, type Device, type World } from "./harness";
import { createTestD1 } from "./d1-sqlite";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ROTATE_AFTER = 7 * DAY;
const MAX_AGE = 30 * DAY;
const GRACE = 24 * HOUR;
const ROUTE = "/v1/devices/rotate-token";
const here = path.dirname(fileURLToPath(import.meta.url));

afterEach(() => vi.useRealTimers());

/** Freeze Date inside the NEXT minute (so SQL's real clock is never ahead of it), as worker.test.ts does. */
function freeze(secondIntoMinute = 20) {
  const minute = Math.floor(Date.now() / MINUTE) * MINUTE + MINUTE;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(minute + secondIntoMinute * 1000);
}
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

type Overrides = { token?: string; issuedAt?: number; signWith?: Device["key"]; signedToken?: string; signedDeviceId?: string };

/** The exact bytes the phone signs: written out literally so the wire format is pinned here, not borrowed from the code under test. */
async function proofBody(device: Device, o: Overrides = {}) {
  const issuedAt = o.issuedAt ?? Date.now();
  const message = `sahelflow.device-token-rotate.v1\n${WORKSPACE_ID}\n${o.signedDeviceId ?? device.deviceId}\n${sha(o.signedToken ?? o.token ?? device.token)}\n${issuedAt}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, (o.signWith ?? device.key).privateKey, new TextEncoder().encode(message)),
  );
  return { workspaceId: WORKSPACE_ID, deviceId: device.deviceId, issuedAt, signature: Buffer.from(signature).toString("base64") };
}
const rotate = async (w: World, device: Device, o: Overrides = {}, headers?: Record<string, string>) =>
  w.call(ROUTE, { method: "POST", token: o.token ?? device.token, body: await proofBody(device, o), ...(headers ? { headers } : {}) });
/** 401 = the token is refused; anything else (404 "no projection") = the token was accepted. */
const authStatus = async (w: World, device: Device, token: string) => (await w.getProjection({ ...device, token })).status;
const tokenRow = (w: World, device: Device) =>
  w.rows<{ token_hash: string; token_issued_at: number | null; prev_token_hash: string | null; prev_token_valid_until: number | null }>(
    "SELECT token_hash, token_issued_at, prev_token_hash, prev_token_valid_until FROM connected_device WHERE device_id = ?",
    device.deviceId,
  )[0]!;
type Rotated = { rotated: boolean; deviceToken?: string; tokenExpiresAt?: number };

async function setup(options = {}) {
  freeze();
  const w = await createWorld(options);
  const a = await w.pair("device_alice_01", "member_owner");
  return { w, a };
}

describe("the numbers", () => {
  it("are 7 days to rotate, 30 days to live, 24 hours of grace, 10 minutes of clock skew", async () => {
    const mod = await import("../device-token");
    expect(mod.TOKEN_ROTATE_AFTER_MS).toBe(ROTATE_AFTER);
    expect(mod.TOKEN_MAX_AGE_MS).toBe(MAX_AGE);
    expect(mod.TOKEN_ROTATE_GRACE_MS).toBe(GRACE);
    expect(mod.ROTATE_PROOF_MAX_SKEW_MS).toBe(10 * MINUTE);
  });
});

describe("token lifetime (no phone change needed: old shells never rotate)", () => {
  it("a new pairing stamps the token with the time it was issued and no previous token", async () => {
    const { w, a } = await setup();
    const row = tokenRow(w, a);
    expect(row.token_issued_at).toBe(Date.now());
    expect(row.prev_token_hash).toBeNull();
    expect(row.prev_token_valid_until).toBeNull();
  });

  it("a token older than the rotate age but younger than the maximum still works on every phone route", async () => {
    const { w, a } = await setup();
    advance(ROTATE_AFTER + DAY);
    expect(await authStatus(w, a, a.token)).not.toBe(401);
    expect((await w.call(`/v1/commands/cmd_00000001?workspaceId=${WORKSPACE_ID}&deviceId=${a.deviceId}`, { token: a.token })).status).toBe(404);
    advance(MAX_AGE - ROTATE_AFTER - DAY - 1); // age = MAX_AGE - 1 ms
    expect(await authStatus(w, a, a.token)).not.toBe(401);
  });

  it("a token at the maximum age is refused on every phone route, like an unknown token (no new oracle)", async () => {
    const { w, a } = await setup();
    const unknown = await w.getProjection({ ...a, token: "z".repeat(43) });
    advance(MAX_AGE);
    const expired = await w.getProjection(a);
    expect(expired.status).toBe(401);
    expect(await expired.text()).toBe(await unknown.text());
    const status = await w.call(`/v1/commands/cmd_00000001?workspaceId=${WORKSPACE_ID}&deviceId=${a.deviceId}`, { token: a.token });
    expect(status.status).toBe(401);
    expect((await w.submit(a, await w.commandEnvelope(a))).status).toBe(401);
  });

  it("an expired token cannot be rotated: the phone must pair again", async () => {
    const { w, a } = await setup();
    advance(MAX_AGE + HOUR);
    expect((await rotate(w, a)).status).toBe(401);
    expect(tokenRow(w, a).token_hash).toBe(sha(a.token));
  });

  it("a row with no issue time (inserted by the old worker after the migration) is stamped at first use, never locked out", async () => {
    const { w, a } = await setup();
    w.d1.sqlite.prepare("UPDATE connected_device SET token_issued_at = NULL, created_at = '2020-01-01 00:00:00' WHERE device_id = ?").run(a.deviceId);
    expect(await authStatus(w, a, a.token)).not.toBe(401);
    expect(tokenRow(w, a).token_issued_at).toBe(Date.now());
    advance(MAX_AGE - 1);
    expect(await authStatus(w, a, a.token)).not.toBe(401);
    advance(1);
    expect(await authStatus(w, a, a.token)).toBe(401);
  });
});

describe("rotation (POST /v1/devices/rotate-token)", () => {
  it("a young token is told it is not due: no new token, nothing changes", async () => {
    const { w, a } = await setup();
    advance(ROTATE_AFTER - HOUR);
    const answer = await rotate(w, a);
    expect(answer.status).toBe(200);
    const body = (await answer.json()) as Rotated;
    expect(body.rotated).toBe(false);
    expect(body.deviceToken).toBeUndefined();
    expect(body.tokenExpiresAt).toBe(Date.now() - (ROTATE_AFTER - HOUR) + MAX_AGE);
    const row = tokenRow(w, a);
    expect(row.token_hash).toBe(sha(a.token));
    expect(row.prev_token_hash).toBeNull();
  });

  it("an old token is swapped: the new token works, the old one works for the grace window and then stops", async () => {
    const { w, a } = await setup();
    advance(ROTATE_AFTER);
    const answer = await rotate(w, a);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("Cache-Control")).toBe("no-store");
    const body = (await answer.json()) as Rotated;
    expect(body.rotated).toBe(true);
    const fresh = body.deviceToken ?? "";
    expect(fresh.length).toBeGreaterThanOrEqual(43);
    expect(fresh).not.toBe(a.token);
    expect(body.tokenExpiresAt).toBe(Date.now() + MAX_AGE);
    // Only hashes are stored, the plaintext is nowhere in the table.
    const row = tokenRow(w, a);
    expect(row.token_hash).toBe(sha(fresh));
    expect(row.token_issued_at).toBe(Date.now());
    expect(row.prev_token_hash).toBe(sha(a.token));
    expect(row.prev_token_valid_until).toBe(Date.now() + GRACE);
    expect(JSON.stringify(w.rows("SELECT * FROM connected_device"))).not.toContain(fresh);
    expect(await authStatus(w, a, fresh)).not.toBe(401);
    advance(GRACE - 1);
    expect(await authStatus(w, a, a.token)).not.toBe(401);
    expect(await authStatus(w, a, fresh)).not.toBe(401);
    advance(1);
    expect(await authStatus(w, a, a.token)).toBe(401);
    expect(await authStatus(w, a, fresh)).not.toBe(401);
  });

  it("the new token has its own full life: fine at 30 days minus 1 ms after the swap, refused at 30 days", async () => {
    const { w, a } = await setup();
    advance(ROTATE_AFTER);
    const fresh = ((await (await rotate(w, a)).json()) as Rotated).deviceToken ?? "";
    advance(MAX_AGE - 1);
    expect(await authStatus(w, a, fresh)).not.toBe(401);
    advance(1);
    expect(await authStatus(w, a, fresh)).toBe(401);
  });

  it("a lost answer cannot lock the phone out: the phone asks again with the OLD token and gets a working token", async () => {
    const { w, a } = await setup();
    advance(ROTATE_AFTER);
    const lost = ((await (await rotate(w, a)).json()) as Rotated).deviceToken ?? "";
    advance(2 * HOUR);
    const again = await rotate(w, a); // still the old token: the answer above never reached the phone
    expect(again.status).toBe(200);
    const second = (await again.json()) as Rotated;
    expect(second.rotated).toBe(true);
    const kept = second.deviceToken ?? "";
    expect(kept).not.toBe(lost);
    expect(await authStatus(w, a, kept)).not.toBe(401);
    expect(await authStatus(w, a, lost)).toBe(401); // never two live new tokens
    const row = tokenRow(w, a);
    expect(row.prev_token_hash).toBe(sha(a.token));
    expect(row.prev_token_valid_until).toBe(Date.now() - 2 * HOUR + GRACE); // the grace deadline is NOT extended
    advance(GRACE);
    expect(await authStatus(w, a, a.token)).toBe(401);
    expect(await authStatus(w, a, kept)).not.toBe(401);
  });

  it("two swaps at the same instant leave exactly one live new token", async () => {
    const { w, a } = await setup({ yieldBetween: true });
    advance(ROTATE_AFTER);
    const [first, second] = await Promise.all([rotate(w, a), rotate(w, a)]);
    const results = await Promise.all([first, second].map(async (r) => ({ status: r.status, body: (await r.json()) as Rotated & { error?: string } })));
    for (const r of results) expect([200, 409]).toContain(r.status);
    const issued = results.filter((r) => r.body.rotated === true).map((r) => r.body.deviceToken ?? "");
    expect(issued.length).toBeGreaterThanOrEqual(1);
    const live: string[] = [];
    for (const token of issued) if ((await authStatus(w, a, token)) !== 401) live.push(token);
    expect(live).toHaveLength(1);
    expect(sha(live[0] ?? "")).toBe(tokenRow(w, a).token_hash);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.error).toBe("rotation_conflict");
  });

  it("a thief with the token but not the phone's signing key cannot rotate, and a failed attempt changes nothing", async () => {
    const { w, a } = await setup();
    advance(ROTATE_AFTER + DAY);
    const thiefKey = await w.generateSigningKey();
    const refused = await rotate(w, a, { signWith: thiefKey });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: "invalid_proof" });
    const row = tokenRow(w, a);
    expect(row.token_hash).toBe(sha(a.token));
    expect(row.prev_token_hash).toBeNull();
  });

  it("a proof is bound to the token, the device and the clock", async () => {
    const { w, a } = await setup();
    const b = await w.pair("device_bob_0001", "member_two", "203.0.113.8");
    advance(ROTATE_AFTER + DAY);
    // signed for another token / another device id
    expect((await rotate(w, a, { signedToken: b.token })).status).toBe(403);
    expect((await rotate(w, a, { signedDeviceId: b.deviceId })).status).toBe(403);
    // stale and future clocks (11 minutes), fresh within the skew (9 minutes)
    expect((await rotate(w, a, { issuedAt: Date.now() - 11 * MINUTE })).status).toBe(403);
    expect((await rotate(w, a, { issuedAt: Date.now() + 11 * MINUTE })).status).toBe(403);
    expect((await rotate(w, a, { issuedAt: Date.now() - 9 * MINUTE })).status).toBe(200);
    expect(tokenRow(w, b).token_hash).toBe(sha(b.token)); // the other phone was never touched
  });

  it("refuses a body that is not a proof (400) and a garbage signature (403, never a crash)", async () => {
    const { w, a } = await setup();
    advance(ROTATE_AFTER + DAY);
    const good = await proofBody(a);
    for (const broken of [
      { ...good, issuedAt: "now" }, { ...good, workspaceId: 7 }, { ...good, deviceId: "" }, { ...good, signature: 5 },
      { workspaceId: good.workspaceId },
    ]) {
      expect((await w.call(ROUTE, { method: "POST", token: a.token, body: broken })).status).toBe(400);
    }
    for (const signature of ["!!!", "QUJD", Buffer.alloc(64).toString("base64"), ""]) {
      const r = await w.call(ROUTE, { method: "POST", token: a.token, body: { ...good, signature } });
      expect([400, 403]).toContain(r.status);
      expect(r.status).toBeLessThan(500);
    }
    expect(tokenRow(w, a).token_hash).toBe(sha(a.token));
  });

  it("a signature longer than the named limit is a 400 before any key work; one at the limit is only a wrong proof (403)", async () => {
    const mod = await import("../device-token");
    const limit = mod.MAX_ROTATE_SIGNATURE_CHARS;
    expect(limit).toBe(200); // an Ed25519 signature is 88 base64 characters; 200 is room, not a target
    const { w, a } = await setup();
    advance(ROTATE_AFTER + DAY);
    const good = await proofBody(a);
    const over = await w.call(ROUTE, { method: "POST", token: a.token, body: { ...good, signature: "A".repeat(limit + 1) } });
    expect(over.status).toBe(400);
    const at = await w.call(ROUTE, { method: "POST", token: a.token, body: { ...good, signature: "A".repeat(limit) } });
    expect(at.status).toBe(403);
    expect(tokenRow(w, a).token_hash).toBe(sha(a.token));
  });

  it("answers 401 to no token, a wrong token, another device's token, and to a revoked phone", async () => {
    const { w, a } = await setup();
    const b = await w.pair("device_bob_0001", "member_two", "203.0.113.8");
    advance(ROTATE_AFTER + DAY);
    expect((await w.call(ROUTE, { method: "POST", body: await proofBody(a) })).status).toBe(401);
    expect((await rotate(w, a, { token: "q".repeat(43) })).status).toBe(401);
    expect((await rotate(w, a, { token: b.token })).status).toBe(401);
    expect((await w.revoke(a.deviceId, 1)).status).toBe(200);
    expect((await rotate(w, a)).status).toBe(401);
    expect(await authStatus(w, a, a.token)).toBe(401);
  });

  it("is rate limited per device: 6 a minute, the 7th is 429 with Retry-After", async () => {
    const { w, a } = await setup();
    for (let i = 0; i < 6; i += 1) expect((await rotate(w, a)).status).toBe(200);
    const limited = await rotate(w, a);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });

  it("answers the phone origin with CORS (POST + Authorization are already allowed) and is no-store", async () => {
    const { w, a } = await setup({ pwaOrigins: PWA_ORIGIN });
    const preflight = await w.call(ROUTE, {
      method: "OPTIONS",
      headers: { Origin: PWA_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
    });
    expect(preflight.status).toBe(204);
    const answer = await rotate(w, a, {}, { Origin: PWA_ORIGIN });
    expect(answer.status).toBe(200);
    expect(answer.headers.get("Access-Control-Allow-Origin")).toBe(PWA_ORIGIN);
    expect(answer.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses a body over 4 KiB before reading it all (413)", async () => {
    const { w, a } = await setup();
    const big = await w.call(ROUTE, { method: "POST", token: a.token, body: { ...(await proofBody(a)), pad: "x".repeat(5000) } });
    expect(big.status).toBe(413);
  });
});

describe("rollout: the migration file", () => {
  // Read inside each test: before the migration exists the tests must FAIL one by one, not break the whole file.
  const migrationText = () => readFileSync(path.join(here, "..", "migrations", "0004_device_token_lifetime.sql"), "utf8");
  const OLD_DEVICE_TABLE = `CREATE TABLE connected_device (
    workspace_id TEXT NOT NULL, device_id TEXT NOT NULL, member_id TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL,
    signing_public_key TEXT NOT NULL, encryption_public_key TEXT NOT NULL, revocation_epoch INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT, revoked_at TEXT,
    PRIMARY KEY(workspace_id, device_id))`;
  const columns = (sqlite: ReturnType<typeof createTestD1>["sqlite"]) =>
    (sqlite.prepare("PRAGMA table_info(connected_device)").all() as { name: string; type: string; notnull: number }[])
      .map((c) => `${c.name}:${c.type}:${c.notnull}`).sort();

  it("gives every phone paired before it a full fresh lifetime from the day it runs, and does not touch the token", () => {
    const old = createTestD1().sqlite;
    old.exec(OLD_DEVICE_TABLE);
    old.prepare("INSERT INTO connected_device (workspace_id, device_id, member_id, token_hash, signing_public_key, encryption_public_key, created_at) VALUES ('ws_1','d_1','m_1','h1','k','e','2020-01-01 00:00:00')").run();
    const before = Date.now();
    old.exec(migrationText());
    const row = old.prepare("SELECT token_hash, token_issued_at, prev_token_hash, prev_token_valid_until FROM connected_device").get() as Record<string, unknown>;
    expect(row.token_hash).toBe("h1");
    expect(Number(row.token_issued_at)).toBeGreaterThanOrEqual(before - 2000);
    expect(Number(row.token_issued_at)).toBeLessThanOrEqual(Date.now() + 2000);
    expect(row.prev_token_hash).toBeNull();
    expect(row.prev_token_valid_until).toBeNull();
  });

  it("leaves the table with the same columns as schema.sql", () => {
    const fromMigration = createTestD1().sqlite;
    fromMigration.exec(OLD_DEVICE_TABLE);
    fromMigration.exec(migrationText());
    const fromSchema = createTestD1().sqlite;
    fromSchema.exec(readFileSync(path.join(here, "..", "schema.sql"), "utf8"));
    expect(columns(fromMigration)).toEqual(columns(fromSchema));
  });

  it("/healthz says unavailable until the migration is applied", async () => {
    freeze();
    const w = await createWorld();
    expect((await w.call("/healthz")).status).toBe(200);
    w.d1.sqlite.exec("ALTER TABLE connected_device DROP COLUMN token_issued_at");
    expect((await w.call("/healthz")).status).toBe(503);
  });
});
