import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PUSH_KINDS,
  PUSH_POLICY,
  PayloadError,
  buildPayload,
  isPushKind,
  serializePayload,
  topicFor,
} from "../payload";

const NOW = 1_790_000_000_999;
const ID = "0123456789abcdef";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof PayloadError ? error.code : "other:" + String(error);
  }
  return "no-throw";
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("kinds and delivery policy", () => {
  it("lists exactly the six kinds", () => {
    expect([...PUSH_KINDS]).toEqual(["orders", "whatsapp", "delivery_failed", "held", "backup_failed", "licence"]);
    expect(isPushKind("orders")).toBe(true);
    for (const bad of ["sms", "", "ORDERS", "__proto__", "toString", 5, null, undefined]) {
      expect(isPushKind(bad)).toBe(false);
    }
  });

  it("keeps the TTL (seconds) and Urgency of the design for every kind", () => {
    expect(PUSH_POLICY).toEqual({
      orders: { ttlSeconds: 6 * 3600, urgency: "normal" },
      whatsapp: { ttlSeconds: 2 * 3600, urgency: "normal" },
      delivery_failed: { ttlSeconds: 12 * 3600, urgency: "normal" },
      held: { ttlSeconds: 4 * 3600, urgency: "high" },
      backup_failed: { ttlSeconds: 24 * 3600, urgency: "normal" },
      licence: { ttlSeconds: 24 * 3600, urgency: "low" },
    });
  });
});

describe("buildPayload", () => {
  it("builds exactly {v,k,n,t,id} with t in whole seconds", () => {
    expect(buildPayload({ kind: "orders", count: 5, now: NOW, id: ID })).toEqual({
      v: 1,
      k: "orders",
      n: 5,
      t: 1_790_000_000,
      id: ID,
    });
  });

  it("makes a random 16-hex id when none is given", () => {
    const a = buildPayload({ kind: "held", count: 1, now: NOW });
    const b = buildPayload({ kind: "held", count: 1, now: NOW });
    expect(a.id).toMatch(/^[0-9a-f]{16}$/);
    expect(a.id).not.toBe(b.id);
  });

  it("throws on an unknown kind", () => {
    for (const kind of ["sms", "", "ORDERS", "__proto__", undefined, 5]) {
      expect(codeOf(() => buildPayload({ kind: kind as never, count: 1, now: NOW, id: ID }))).toBe("unknown_kind");
    }
  });

  it("throws on a negative, fractional or non-numeric count, and accepts 0 and big whole numbers", () => {
    for (const count of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "5", undefined, null, 2 ** 53]) {
      expect(codeOf(() => buildPayload({ kind: "orders", count: count as never, now: NOW, id: ID }))).toBe("bad_count");
    }
    expect(buildPayload({ kind: "orders", count: 0, now: NOW, id: ID }).n).toBe(0);
    expect(buildPayload({ kind: "orders", count: Number.MAX_SAFE_INTEGER, now: NOW, id: ID }).n).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("throws on a bad clock or id", () => {
    for (const now of [Number.NaN, -1, Number.POSITIVE_INFINITY, "x"]) {
      expect(codeOf(() => buildPayload({ kind: "orders", count: 1, now: now as never, id: ID }))).toBe("bad_time");
    }
    for (const id of ["xyz", "0123456789ABCDEF", "0123456789abcde", "0123456789abcdef0"]) {
      expect(codeOf(() => buildPayload({ kind: "orders", count: 1, now: NOW, id }))).toBe("bad_id");
    }
  });

  it("property: the plaintext has exactly the five keys, whatever the caller passes in", () => {
    const rand = lcg(20261031);
    const hex = (): string => Array.from({ length: 16 }, () => Math.floor(rand() * 16).toString(16)).join("");
    for (let i = 0; i < 400; i += 1) {
      const kind = PUSH_KINDS[Math.floor(rand() * PUSH_KINDS.length)] ?? "orders";
      const count = Math.floor(rand() * 1_000_000);
      const now = Math.floor(1.6e12 + rand() * 4e11);
      const id = hex();
      const input = {
        kind,
        count,
        now,
        id,
        // Things that must never travel: the builder has to ignore them.
        name: "Amine Benali",
        phone: "0550 12 34 56",
        amount: 12500,
        orderNumber: "SF-" + Math.floor(rand() * 9999),
        product: "Sneakers",
        text: "salam",
      } as unknown as Parameters<typeof buildPayload>[0];
      const text = Buffer.from(serializePayload(buildPayload(input))).toString("utf8");
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual(["id", "k", "n", "t", "v"]);
      expect(text).toMatch(/^\{"v":1,"k":"[a-z_]+","n":\d+,"t":\d+,"id":"[0-9a-f]{16}"\}$/);
      for (const secret of ["Amine", "0550", "12500", "Sneakers", "salam", "SF-"]) {
        expect(text).not.toContain(secret);
      }
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(255);
    }
  });

  it("serializes in a fixed key order", () => {
    const text = Buffer.from(serializePayload(buildPayload({ kind: "licence", count: 2, now: NOW, id: ID }))).toString("utf8");
    expect(text).toBe('{"v":1,"k":"licence","n":2,"t":1790000000,"id":"0123456789abcdef"}');
  });
});

describe("topicFor", () => {
  const secret = new Uint8Array(16).fill(5);

  it("is base64url(HMAC-SHA256(authSecret, kind)) cut to 22 characters", () => {
    for (const kind of PUSH_KINDS) {
      const expected = createHmac("sha256", secret).update(kind).digest("base64url").slice(0, 22);
      expect(topicFor(secret, kind)).toBe(expected);
      expect(topicFor(secret, kind)).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(topicFor(secret, kind)).not.toContain(kind);
    }
  });

  it("differs per kind and per subscription", () => {
    const topics = new Set(PUSH_KINDS.map((kind) => topicFor(secret, kind)));
    expect(topics.size).toBe(PUSH_KINDS.length);
    expect(topicFor(new Uint8Array(16).fill(6), "orders")).not.toBe(topicFor(secret, "orders"));
  });

  it("throws on an unknown kind or a secret of the wrong size", () => {
    expect(codeOf(() => topicFor(secret, "sms" as never))).toBe("unknown_kind");
    expect(codeOf(() => topicFor(new Uint8Array(0), "orders"))).toBe("bad_secret");
  });
});

describe("serializePayload", () => {
  it("writes only the five fields even if the object it is given carries more", () => {
    const dirty = {
      ...buildPayload({ kind: "orders", count: 1, now: NOW, id: ID }),
      name: "Amine",
      phone: "0550",
    } as unknown as ReturnType<typeof buildPayload>;
    const text = Buffer.from(serializePayload(dirty)).toString("utf8");
    expect(text).toBe('{"v":1,"k":"orders","n":1,"t":1790000000,"id":"0123456789abcdef"}');
  });
});
