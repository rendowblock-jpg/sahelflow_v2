// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createMediaLedger,
  MEDIA_SERVICE_KEY,
  mediaPhotoKey,
  SERVICE_FRESH_MS,
  serviceIsFresh,
  type MediaLedgerDb,
} from "../media-ledger";

function fakeDb() {
  const rows = new Map<string, string>();
  const db: MediaLedgerDb = {
    setting: {
      async findUnique({ where }) { const value = rows.get(where.key); return value === undefined ? null : { value }; },
      async findMany({ where }) { return where.key.in.filter((key) => rows.has(key)).map((key) => ({ key, value: rows.get(key) ?? "" })); },
      async upsert({ where, create, update }) { rows.set(where.key, rows.has(where.key) ? update.value : create.value); return {}; },
    },
  };
  return { db, rows };
}
const HASH = "0123456789abcdef01234567";
const T0 = new Date("2026-10-31T10:00:00.000Z");

describe("media ledger", () => {
  it("writes the service row on every check and keeps only the latest", async () => {
    const { db, rows } = fakeDb();
    const ledger = createMediaLedger(db, () => T0);
    await ledger.recordService("on");
    expect(JSON.parse(rows.get(MEDIA_SERVICE_KEY) ?? "")).toEqual({ state: "on", at: T0.toISOString() });
    await ledger.recordService("off");
    expect(await ledger.readService()).toEqual({ state: "off", at: T0.toISOString() });
  });

  it("writes a hosted row under the storefront's own key", async () => {
    const { db, rows } = fakeDb();
    await createMediaLedger(db, () => T0).recordHosted("storefront_a", HASH);
    expect(JSON.parse(rows.get(`storefront.media.storefront_a.${HASH}`) ?? "")).toEqual({ state: "hosted", at: T0.toISOString() });
    expect(mediaPhotoKey("storefront_a", HASH)).toBe(`storefront.media.storefront_a.${HASH}`);
  });

  it("never counts another storefront's row as hosted", async () => {
    const { db } = fakeDb();
    const ledger = createMediaLedger(db, () => T0);
    await ledger.recordHosted("storefront_a", HASH);
    expect([...(await ledger.readHosted("storefront_a", [HASH]))]).toEqual([HASH]);
    expect((await ledger.readHosted("storefront_b", [HASH])).size).toBe(0);
  });

  it("ignores rows that are not a hosted record", async () => {
    const { db, rows } = fakeDb();
    rows.set(mediaPhotoKey("s", HASH), "not json");
    rows.set(mediaPhotoKey("s", "f".repeat(24)), JSON.stringify({ state: "pending" }));
    const ledger = createMediaLedger(db, () => T0);
    expect((await ledger.readHosted("s", [HASH, "f".repeat(24)])).size).toBe(0);
    rows.set(MEDIA_SERVICE_KEY, "garbage");
    expect(await ledger.readService()).toBeNull();
    rows.set(MEDIA_SERVICE_KEY, JSON.stringify({ state: "maybe", at: T0.toISOString() }));
    expect(await ledger.readService()).toBeNull();
  });

  it("asks nothing when there is nothing to look up", async () => {
    const { db } = fakeDb();
    expect((await createMediaLedger(db).readHosted("s", [])).size).toBe(0);
  });
});

describe("serviceIsFresh", () => {
  const row = (state: "on" | "off", at: Date) => ({ state, at: at.toISOString() });
  it("is true only for an 'on' answer younger than 24 hours", () => {
    expect(serviceIsFresh(row("on", new Date(T0.getTime() - 3_600_000)), T0)).toBe(true);
    expect(serviceIsFresh(row("on", new Date(T0.getTime() - SERVICE_FRESH_MS + 1000)), T0)).toBe(true);
    expect(serviceIsFresh(row("on", new Date(T0.getTime() - SERVICE_FRESH_MS - 1000)), T0)).toBe(false);
    expect(serviceIsFresh(row("on", new Date(T0.getTime() - 25 * 3_600_000)), T0)).toBe(false);
    expect(serviceIsFresh(row("off", T0), T0)).toBe(false);
    expect(serviceIsFresh(null, T0)).toBe(false);
    expect(serviceIsFresh({ state: "on", at: "garbage" }, T0)).toBe(false);
    expect(serviceIsFresh(row("on", new Date(T0.getTime() + 3_600_000)), T0)).toBe(false);
  });
});
