import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PUSH_KINDS, PUSH_POLICY, topicFor } from "../payload";
import {
  BACKOFF_MS,
  DEFAULT_TIMEOUT_MS,
  MAX_RETRIES,
  sendPush,
  type PushFetch,
  type PushFetchInit,
} from "../sender";
import { generateVapidKeys } from "../vapid";
import { decryptBody, newReceiver } from "./receiver-helper";

const EP = "https://fcm.googleapis.com/fcm/send/TEST-ONLY-TOKEN-1";
const NOW = 1_790_000_000_000;
const vapid = { ...generateVapidKeys(), subject: "https://example.test/phone" };

const fixtureP = (async () => {
  const receiver = await newReceiver();
  return {
    receiver,
    subscription: {
      endpoint: EP,
      p256dh: Buffer.from(receiver.publicRaw).toString("base64url"),
      auth: Buffer.from(receiver.authSecret).toString("base64url"),
    },
  };
})();

type Step = { status: number; headers?: Record<string, string> } | Error;

function scripted(...steps: Step[]): { fetchImpl: PushFetch; calls: Array<{ url: string; init: PushFetchInit }> } {
  const calls: Array<{ url: string; init: PushFetchInit }> = [];
  const fetchImpl: PushFetch = async (url, init) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    if (!step) throw new Error("no scripted step");
    if (step instanceof Error) throw step;
    const headers = step.headers ?? {};
    return { status: step.status, headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } };
  };
  return { fetchImpl, calls };
}

async function run(steps: Step[], extra: Partial<Parameters<typeof sendPush>[0]> = {}) {
  const { receiver, subscription } = await fixtureP;
  const fake = scripted(...steps);
  const result = await sendPush({
    subscription,
    kind: "orders",
    count: 5,
    vapid,
    fetchImpl: fake.fetchImpl,
    now: NOW,
    ...extra,
  });
  return { result, calls: fake.calls, receiver, subscription };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a successful push", () => {
  it("posts one encrypted record that the browser side can decrypt, with the right headers", async () => {
    const { result, calls, receiver } = await run([{ status: 201 }], { id: "fedcba9876543210" });
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call) throw new Error("no call");
    expect(result).toEqual({
      status: "ok",
      httpStatus: 201,
      endpointHash: createHash("sha256").update(EP).digest("hex").slice(0, 12),
    });
    expect(call.url).toBe(EP);
    expect(call.init.method).toBe("POST");
    expect(call.init.redirect).toBe("error");
    expect(call.init.credentials).toBe("omit");
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    expect(call.init.headers).toEqual({
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "21600",
      Urgency: "normal",
      Topic: topicFor(receiver.authSecret, "orders"),
      Authorization: expect.stringMatching(/^vapid t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+, k=[A-Za-z0-9_-]+$/),
    });
    expect(call.init.headers.Authorization).toContain(", k=" + vapid.publicKey);
    expect(call.init.body.length).toBe(358);
    expect(call.init.body.length).toBeLessThanOrEqual(4096);
    const plain = JSON.parse(Buffer.from(await decryptBody(call.init.body, receiver)).toString("utf8"));
    expect(plain).toEqual({ v: 1, k: "orders", n: 5, t: 1_790_000_000, id: "fedcba9876543210" });
  });

  it("uses the TTL and Urgency of every kind", async () => {
    for (const kind of PUSH_KINDS) {
      const { calls } = await run([{ status: 201 }], { kind });
      const headers = calls[0]?.init.headers;
      expect(headers?.TTL).toBe(String(PUSH_POLICY[kind].ttlSeconds));
      expect(headers?.Urgency).toBe(PUSH_POLICY[kind].urgency);
    }
  });

  it("never returns or logs the endpoint, keys or payload", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const { subscription } = await fixtureP;
    const scenarios: Step[][] = [
      [{ status: 201 }],
      [{ status: 410 }],
      [{ status: 500 }],
      [{ status: 403 }],
      [{ status: 413 }],
      [new Error("connect failed to " + EP + " with " + subscription.auth)],
    ];
    for (const steps of scenarios) {
      const { result } = await run(steps);
      const text = JSON.stringify(result);
      for (const secret of [EP, "TEST-ONLY", subscription.p256dh, subscription.auth, vapid.privateKey, "fcm.googleapis.com"]) {
        expect(text).not.toContain(secret);
      }
      expect(result.endpointHash).toMatch(/^[0-9a-f]{12}$/);
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("how each answer is classified", () => {
  const TABLE: Array<[number, string]> = [
    [200, "ok"], [201, "ok"], [202, "ok"],
    [404, "gone"], [410, "gone"],
    [401, "vapid_problem"], [403, "vapid_problem"],
    [413, "bug"], [400, "bug"], [405, "bug"], [409, "bug"], [422, "bug"], [302, "bug"],
    [429, "retry"], [500, "retry"], [502, "retry"], [503, "retry"], [599, "retry"],
  ];
  it.each(TABLE)("HTTP %i is %s", async (httpStatus, status) => {
    const { result } = await run([{ status: httpStatus }]);
    expect(result.status).toBe(status);
    expect(result.httpStatus).toBe(httpStatus);
  });
});

describe("backoff", () => {
  it("waits 1, 5 and 15 minutes, then gives up after three retries", async () => {
    expect([...BACKOFF_MS]).toEqual([60_000, 300_000, 900_000]);
    expect(MAX_RETRIES).toBe(3);
    for (const [attempt, wait] of [[1, 60_000], [2, 300_000], [3, 900_000]] as const) {
      for (const step of [{ status: 500 }, { status: 429 }, new Error("boom")] as Step[]) {
        const { result } = await run([step], { attempt });
        expect(result).toMatchObject({ status: "retry", retryAfterMs: wait, nextAttempt: attempt + 1 });
      }
    }
    for (const step of [{ status: 500 }, { status: 429, headers: { "retry-after": "30" } }, new Error("boom")] as Step[]) {
      const { result } = await run([step], { attempt: 4 });
      expect(result.status).toBe("gave_up");
    }
  });

  it("refuses an attempt number that is not a whole number from 1", async () => {
    for (const attempt of [0, -1, 1.5, Number.NaN]) {
      await expect(run([{ status: 500 }], { attempt })).rejects.toThrow();
    }
  });

  it("honours Retry-After on a 429 (seconds or date), within 1 second to 1 hour", async () => {
    const wait = async (value: string): Promise<number> => {
      const { result } = await run([{ status: 429, headers: { "retry-after": value } }]);
      return result.status === "retry" ? result.retryAfterMs : -1;
    };
    expect(await wait("120")).toBe(120_000);
    expect(await wait(new Date(NOW + 90_000).toUTCString())).toBe(90_000);
    expect(await wait("0")).toBe(1_000);
    expect(await wait(new Date(NOW - 50_000).toUTCString())).toBe(1_000);
    expect(await wait("86400")).toBe(3_600_000);
    expect(await wait("soon")).toBe(60_000);
    expect(await wait("-5")).toBe(60_000);
  });

  it("treats a thrown fetch and a timeout as a retry with no HTTP status", async () => {
    const thrown = await run([new TypeError("fetch failed")]);
    expect(thrown.result).toMatchObject({ status: "retry", httpStatus: null });
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
    const hung: PushFetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted " + EP)));
      });
    const { subscription } = await fixtureP;
    const result = await sendPush({ subscription, kind: "orders", count: 1, vapid, fetchImpl: hung, now: NOW, timeoutMs: 25 });
    expect(result).toMatchObject({ status: "retry", httpStatus: null });
    expect(JSON.stringify(result)).not.toContain("TEST-ONLY");
  });
});

describe("the address guard", () => {
  const REFUSED = [
    "http://127.0.0.1/x",
    "https://127.0.0.1/x",
    "http://localhost:3000/x",
    "https://localhost/x",
    "https://[::1]/x",
    "https://10.1.2.3/x",
    "https://192.168.0.10/x",
    "https://169.254.169.254/latest/meta-data/",
    "https://printer.local/x",
    "https://fcm.googleapis.com.evil.example/x",
    "http://fcm.googleapis.com/fcm/send/TEST-ONLY",
  ];

  it("refuses local, private, look-alike and http addresses by default, without calling fetch", async () => {
    for (const endpoint of REFUSED) {
      const { subscription } = await fixtureP;
      const { result, calls } = await run([{ status: 201 }], { subscription: { ...subscription, endpoint } });
      expect(result.status).toBe("blocked");
      expect(result.httpStatus).toBeNull();
      expect(calls).toHaveLength(0);
    }
  });

  it("has no environment switch", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_LOCAL_PUSH", "1");
    vi.stubEnv("SAHELFLOW_PUSH_ALLOW_ANY_HOST", "1");
    vi.stubEnv("SAHELFLOW_TEST", "1");
    const { subscription } = await fixtureP;
    const { result, calls } = await run([{ status: 201 }], { subscription: { ...subscription, endpoint: "http://127.0.0.1:9/x" } });
    expect(result.status).toBe("blocked");
    expect(calls).toHaveLength(0);
  });

  it("lets a test inject its own guard, explicitly", async () => {
    const { subscription } = await fixtureP;
    const { result, calls } = await run([{ status: 201 }], {
      subscription: { ...subscription, endpoint: "https://127.0.0.1:9/x" },
      endpointGuard: (endpoint: string) => new URL(endpoint),
    });
    expect(result.status).toBe("ok");
    expect(calls).toHaveLength(1);
  });
});

describe("bad input", () => {
  it("returns bug, without calling fetch, when the stored keys are malformed", async () => {
    const { subscription } = await fixtureP;
    const bad = [
      { ...subscription, p256dh: Buffer.alloc(64, 4).toString("base64url") },
      { ...subscription, p256dh: Buffer.alloc(65, 7).toString("base64url") },
      { ...subscription, auth: Buffer.alloc(15, 1).toString("base64url") },
      { ...subscription, auth: subscription.auth + "=" },
    ];
    for (const sub of bad) {
      const { result, calls } = await run([{ status: 201 }], { subscription: sub });
      expect(result).toMatchObject({ status: "bug", httpStatus: null });
      expect(calls).toHaveLength(0);
    }
  });

  it("throws, before any network use, on an unknown kind or a bad count", async () => {
    await expect(run([{ status: 201 }], { kind: "sms" as never })).rejects.toThrow();
    await expect(run([{ status: 201 }], { count: -1 })).rejects.toThrow();
    await expect(run([{ status: 201 }], { count: 1.5 })).rejects.toThrow();
  });
});
