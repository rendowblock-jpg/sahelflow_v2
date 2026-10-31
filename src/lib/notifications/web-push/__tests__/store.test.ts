import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  STORE_VERSION,
  SUBSCRIPTION_CAP,
  SubscriptionStore,
  SubscriptionStoreError,
  type FileIo,
  type Sealer,
  type SubscriptionRecord,
} from "../store";
import { endpointHash } from "../util";

const POINT = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString("base64url");
const AUTH = Buffer.alloc(16, 9).toString("base64url");

function makeSealer(): Sealer {
  const key = randomBytes(32);
  return {
    seal(plain: Uint8Array): Uint8Array {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plain), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    open(sealed: Uint8Array): Uint8Array {
      const buf = Buffer.from(sealed);
      if (buf.length < 28) throw new Error("sealed data too short");
      const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
      decipher.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
    },
  };
}

function harness() {
  const sealer = makeSealer();
  const state: { bytes: Uint8Array | null } = { bytes: null };
  const io: FileIo = {
    read: async () => state.bytes,
    write: async (bytes) => {
      state.bytes = Uint8Array.from(bytes);
    },
  };
  return { store: new SubscriptionStore({ io, sealer }), sealer, state };
}

function rec(id: string, extra: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    deviceId: id,
    endpoint: "https://fcm.googleapis.com/fcm/send/TEST-ONLY-" + id,
    p256dh: POINT,
    auth: AUTH,
    createdAt: 1_790_000_000_000,
    lastOkAt: null,
    failCount: 0,
    kinds: ["orders", "whatsapp"],
    ...extra,
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof SubscriptionStoreError ? error.code : "other:" + String(error);
  }
  return "no-throw";
}

describe("basic behaviour", () => {
  it("starts empty when there is no file, and round-trips a record", async () => {
    const h = harness();
    expect(await h.store.list()).toEqual([]);
    await h.store.upsert(rec("dev-1"));
    expect(await h.store.list()).toEqual([rec("dev-1")]);
    expect(await h.store.get("dev-1")).toEqual(rec("dev-1"));
    expect(await h.store.get("nope")).toBeNull();
    const plain = JSON.parse(Buffer.from(h.sealer.open(h.state.bytes ?? new Uint8Array())).toString("utf8"));
    expect(STORE_VERSION).toBe(1);
    expect(plain.version).toBe(1);
  });

  it("keeps one subscription per device: a new one replaces the old", async () => {
    const h = harness();
    await h.store.upsert(rec("dev-1"));
    await h.store.upsert(rec("dev-1", { endpoint: "https://fcm.googleapis.com/fcm/send/TEST-ONLY-NEW", failCount: 2 }));
    const all = await h.store.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.endpoint).toBe("https://fcm.googleapis.com/fcm/send/TEST-ONLY-NEW");
    expect(all[0]?.failCount).toBe(2);
  });

  it("caps at 32 devices, still allows replacing one when full", async () => {
    const h = harness();
    expect(SUBSCRIPTION_CAP).toBe(32);
    for (let i = 0; i < 32; i += 1) await h.store.upsert(rec("d" + i));
    expect(await codeOf(h.store.upsert(rec("d32")))).toBe("cap_reached");
    expect(await h.store.list()).toHaveLength(32);
    await h.store.upsert(rec("d5", { failCount: 1 }));
    expect(await h.store.list()).toHaveLength(32);
    expect((await h.store.get("d5"))?.failCount).toBe(1);
  });

  it("removes by device and by endpoint hash", async () => {
    const h = harness();
    await h.store.upsert(rec("a"));
    await h.store.upsert(rec("b"));
    await h.store.upsert(rec("c"));
    expect(await h.store.removeByDevice("a")).toBe(true);
    expect(await h.store.removeByDevice("a")).toBe(false);
    expect(await h.store.removeByEndpointHash(endpointHash(rec("b").endpoint))).toBe(1);
    expect(await h.store.removeByEndpointHash(endpointHash(rec("b").endpoint))).toBe(0);
    expect(await h.store.removeByEndpointHash("not-a-hash")).toBe(0);
    expect((await h.store.list()).map((r) => r.deviceId)).toEqual(["c"]);
  });

  it("records success and failure counts", async () => {
    const h = harness();
    await h.store.upsert(rec("a"));
    expect(await h.store.recordFailure("a")).toBe(1);
    expect(await h.store.recordFailure("a")).toBe(2);
    expect(await h.store.recordSuccess("a", 1_790_000_123_000)).toBe(true);
    expect(await h.store.get("a")).toMatchObject({ failCount: 0, lastOkAt: 1_790_000_123_000 });
    expect(await h.store.recordFailure("zzz")).toBeNull();
    expect(await h.store.recordSuccess("zzz", 1)).toBe(false);
  });

  it("does not lose updates when calls overlap", async () => {
    const h = harness();
    await Promise.all(Array.from({ length: 10 }, (_v, i) => h.store.upsert(rec("d" + i))));
    expect(await h.store.list()).toHaveLength(10);
  });

  it("refuses records that break the contract", async () => {
    const h = harness();
    const bad: SubscriptionRecord[] = [
      rec("a", { endpoint: "http://127.0.0.1/x" }),
      rec("a", { endpoint: "https://fcm.googleapis.com.evil.example/x" }),
      rec("a", { p256dh: Buffer.alloc(64, 4).toString("base64url") }),
      rec("a", { auth: Buffer.alloc(15, 1).toString("base64url") }),
      rec("a", { kinds: ["orders", "sms" as never] }),
      rec("a", { kinds: ["orders", "orders"] }),
      rec("a", { failCount: -1 }),
      rec("", {}),
    ];
    for (const record of bad) expect(await codeOf(h.store.upsert(record))).toBe("invalid_record");
    expect(await h.store.list()).toEqual([]);
  });
});

describe("what is on disk", () => {
  it("contains no readable endpoint, key name, PEM or JWK text", async () => {
    const h = harness();
    await h.store.upsert(rec("dev-1"));
    const bytes = Buffer.from(h.state.bytes ?? new Uint8Array());
    for (const view of [bytes.toString("utf8"), bytes.toString("latin1"), bytes.toString("base64")]) {
      for (const needle of ["https://", "p256dh", "endpoint", "BEGIN", "kty", "TEST-ONLY", "fcm.googleapis", "dev-1", POINT.slice(0, 20)]) {
        expect(view).not.toContain(needle);
      }
    }
  });
});

describe("fails closed", () => {
  it("throws a typed error for a tampered, truncated, empty or random file, and never overwrites it", async () => {
    const h = harness();
    await h.store.upsert(rec("a"));
    const good = Buffer.from(h.state.bytes ?? new Uint8Array());
    const flipped = Buffer.from(good);
    const mid = Math.floor(flipped.length / 2);
    flipped[mid] = (flipped[mid] ?? 0) ^ 0xff;
    const cases: Buffer[] = [flipped, good.subarray(0, good.length - 3), Buffer.alloc(0), randomBytes(100), good.subarray(0, 10)];
    for (const bytes of cases) {
      h.state.bytes = Uint8Array.from(bytes);
      expect(await codeOf(h.store.list())).toBe("corrupt");
      expect(await codeOf(h.store.get("a"))).toBe("corrupt");
      expect(await codeOf(h.store.upsert(rec("b")))).toBe("corrupt");
      expect(await codeOf(h.store.removeByDevice("a"))).toBe("corrupt");
      expect(Buffer.from(h.state.bytes).equals(bytes)).toBe(true);
    }
  });

  it("rejects a sealed file with the wrong version, shape or content", async () => {
    const h = harness();
    const seal = (value: unknown): Uint8Array =>
      h.sealer.seal(Buffer.from(typeof value === "string" ? value : JSON.stringify(value)));
    const set = async (value: unknown): Promise<string> => {
      h.state.bytes = seal(value);
      return codeOf(h.store.list());
    };
    expect(await set({ version: 2, records: [] })).toBe("unsupported_version");
    expect(await set({ version: 1, records: "x" })).toBe("corrupt");
    expect(await set({ records: [] })).toBe("corrupt");
    expect(await set("this is not json")).toBe("corrupt");
    expect(await set({ version: 1, records: [], extra: true })).toBe("corrupt");
    expect(await set({ version: 1, records: [rec("a"), rec("a")] })).toBe("corrupt");
    expect(await set({ version: 1, records: [{ ...rec("a"), kinds: ["sms"] }] })).toBe("corrupt");
    expect(await set({ version: 1, records: [] })).toBe("no-throw");
  });

  it("turns a failing sealer into the typed error too", async () => {
    const h = harness();
    await h.store.upsert(rec("a"));
    const broken = new SubscriptionStore({
      io: { read: async () => h.state.bytes, write: async () => undefined },
      sealer: {
        seal: (p) => p,
        open: () => {
          throw new Error("boom with https://secret.example");
        },
      },
    });
    expect(await codeOf(broken.list())).toBe("corrupt");
    try {
      await broken.list();
    } catch (error) {
      expect((error as Error).message).not.toContain("secret.example");
    }
  });
});
