// W4SEC-04: the pairing exchange is the one route that guesses a secret, so it FAILS CLOSED when its rate counters cannot be used
// (the table is missing, or D1 refuses a statement). Every other route keeps failing open (worker.test.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorld, type World } from "./harness";

const here = path.dirname(fileURLToPath(import.meta.url));
const COUNTERS = readFileSync(path.join(here, "..", "migrations", "0002_rate_limits.sql"), "utf8");
const consumed = (w: World) => w.count("SELECT COUNT(*) AS n FROM connected_pairing WHERE consumed_at IS NOT NULL");
const devices = (w: World) => w.count("SELECT COUNT(*) AS n FROM connected_device");

/** A world with one paired phone (its key is reused) and one fresh pairing waiting to be exchanged. */
async function ready() {
  const w = await createWorld();
  const first = await w.pair();
  const created = await w.createPairing("device_fc000001", "member_owner");
  expect(created.response.status).toBe(201);
  const pairing = { pairingId: created.body.pairingId ?? "", pairingToken: created.body.pairingToken ?? "" };
  return { w, key: first.key, pairing, wrong: { ...pairing, pairingToken: "x".repeat(43) } };
}
/** D1 refuses the statements that match `pattern`, starting with the `nth` match (1 = the first one). */
function refuse(w: World, pattern: RegExp, nth = 1): void {
  const real = w.env.DB;
  let seen = 0;
  w.env.DB = {
    prepare: (sql: string) => {
      if (pattern.test(sql)) { seen += 1; if (seen >= nth) throw new Error("d1 is down"); }
      return real.prepare(sql);
    },
    batch: real.batch.bind(real),
  } as unknown as typeof real;
}

describe("POST /v1/pairings/exchange when the counters cannot be used", () => {
  it("table missing: 503 pairing_unavailable, nothing consumed, no device; once the table is back the SAME pairing works", async () => {
    const { w, key, pairing } = await ready();
    const before = { consumed: consumed(w), devices: devices(w) };
    w.d1.sqlite.exec("DROP TABLE connected_rate_limit");
    const refused = await w.exchange(pairing, key);
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: "pairing_unavailable" });
    expect(refused.headers.get("Cache-Control")).toBe("no-store");
    expect({ consumed: consumed(w), devices: devices(w) }).toEqual(before);
    w.d1.sqlite.exec(COUNTERS);
    const accepted = await w.exchange(pairing, key);
    expect(accepted.status).toBe(201);
    expect({ consumed: consumed(w), devices: devices(w) }).toEqual({ consumed: before.consumed + 1, devices: before.devices + 1 });
  });

  it("table missing: a WRONG token is 503 too, never an unlimited stream of 403 guesses", async () => {
    const { w, key, wrong } = await ready();
    w.d1.sqlite.exec("DROP TABLE connected_rate_limit");
    for (let i = 0; i < 12; i += 1) expect((await w.exchange(wrong, key)).status).toBe(503);
  });

  it("the lock lookup is refused: 503 and nothing consumed", async () => {
    const { w, key, pairing } = await ready();
    const before = consumed(w);
    refuse(w, /SELECT count FROM connected_rate_limit/);
    const res = await w.exchange(pairing, key);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "pairing_unavailable" });
    expect(consumed(w)).toBe(before);
  });

  it("the failure counter cannot be written (second counter write): a wrong token is 503, not 403", async () => {
    const { w, key, wrong } = await ready();
    refuse(w, /INSERT INTO connected_rate_limit/, 2);
    const res = await w.exchange(wrong, key);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "pairing_unavailable" });
  });

  it("the counters work: a right token is 201 and a wrong token is 403 (unchanged)", async () => {
    const { w, key, pairing, wrong } = await ready();
    expect((await w.exchange(wrong, key)).status).toBe(403);
    expect((await w.exchange(pairing, key)).status).toBe(201);
  });

  it("other routes still fail open when the table is missing (only the secret-guessing route is strict)", async () => {
    const { w } = await ready();
    const device = await w.pair();
    w.d1.sqlite.exec("DROP TABLE connected_rate_limit");
    expect((await w.getProjection(device)).status).toBe(404);
  });
});
