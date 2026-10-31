import { describe, expect, it } from "vitest";

import { checkout } from "./checkout";
import { MIN_FILL_MS } from "./abuse";
import { NOW, SLUG, checkoutRequest, honestBody, receiptCount, remaining, seedShop } from "./abuse-test-support";

const slowOpen = NOW - MIN_FILL_MS;
const deps = { now: () => NOW };

async function honest() {
  const { database, env } = await seedShop(10);
  const response = await checkout(checkoutRequest(await honestBody("idem_honest_01", { website: "", formOpenedAt: slowOpen })), env, SLUG, deps);
  const body = await response.json() as Record<string, unknown>;
  return { database, env, response, body };
}

describe("honeypot and minimum fill time (no key needed)", () => {
  it("pins 3 seconds", () => expect(MIN_FILL_MS).toBe(3000));

  it("lets a slow, filled-in form through with an empty honeypot", async () => {
    const { database, response, body } = await honest();
    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: "received", totalDzd: 3000, semantic: "received_queued_for_desktop_import" });
    expect(receiptCount(database)).toBe(1);
    expect(remaining(database)).toBe(9);
  });

  it("answers a filled honeypot exactly like a success and creates nothing", async () => {
    const { body: real } = await honest();
    const { database, env } = await seedShop(10);
    const response = await checkout(checkoutRequest(await honestBody("idem_bot_00001", { website: "http://spam.test", formOpenedAt: slowOpen })), env, SLUG, deps);
    const fake = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(202);
    expect(Object.keys(fake).sort()).toEqual(Object.keys(real).sort());
    expect(fake).toMatchObject({ status: "received", totalDzd: 3000, semantic: "received_queued_for_desktop_import" });
    expect(String(fake.receiptId)).toMatch(/^rcpt_[0-9a-f]{32}$/);
    expect(fake.receiptId).not.toBe(real.receiptId);
    expect(receiptCount(database)).toBe(0);
    expect(remaining(database)).toBe(10);
  });

  it("treats a form filled in under 3 seconds as a bot, 3 seconds exactly as a buyer", async () => {
    const { database, env } = await seedShop(10);
    const fast = await checkout(checkoutRequest(await honestBody("idem_fast_0001", { formOpenedAt: NOW - (MIN_FILL_MS - 1) })), env, SLUG, deps);
    expect(fast.status).toBe(202);
    expect(receiptCount(database)).toBe(0);
    const ok = await checkout(checkoutRequest(await honestBody("idem_fast_0002", { formOpenedAt: NOW - MIN_FILL_MS })), env, SLUG, deps);
    expect(ok.status).toBe(202);
    expect(receiptCount(database)).toBe(1);
  });

  it("treats a future or non-numeric open time as a bot, and an absent one as an older page", async () => {
    const { database, env } = await seedShop(10);
    for (const [index, value] of [NOW + 60_000, "yesterday", null, -5, Number.NaN].entries()) {
      const response = await checkout(checkoutRequest(await honestBody(`idem_odd_000${index}`, { formOpenedAt: value })), env, SLUG, deps);
      expect(response.status).toBe(202);
    }
    expect(receiptCount(database)).toBe(0);
    expect((await checkout(checkoutRequest(await honestBody("idem_old_page1")), env, SLUG, deps)).status).toBe(202);
    expect(receiptCount(database)).toBe(1);
  });

  it("still tells a bot the truth about stock it could see anyway (409), as an honest buyer would hear it", async () => {
    const { env } = await seedShop(2);
    const response = await checkout(checkoutRequest(await honestBody("idem_bot_stock1", { website: "x" }, 5)), env, SLUG, deps);
    expect(response.status).toBe(409);
  });
});

describe("Cloudflare Turnstile: wired, OFF without TURNSTILE_SECRET", () => {
  it("never calls the verifier when no secret is set", async () => {
    const { database, env } = await seedShop(10);
    const calls: unknown[] = [];
    const response = await checkout(checkoutRequest(await honestBody("idem_ts_off_01")), env, SLUG, {
      ...deps, verifyTurnstile: async (input) => { calls.push(input); return false; },
    });
    expect(response.status).toBe(202);
    expect(calls).toEqual([]);
    expect(receiptCount(database)).toBe(1);
  });

  it("with a secret: a good token passes and the verifier gets secret, token and address", async () => {
    const { database, env } = await seedShop(10);
    env.TURNSTILE_SECRET = "test-secret-not-real";
    const calls: unknown[] = [];
    const response = await checkout(
      checkoutRequest(await honestBody("idem_ts_on_001", { turnstileToken: "tok_abc" }), { "CF-Connecting-IP": "203.0.113.5" }),
      env, SLUG, { ...deps, verifyTurnstile: async (input) => { calls.push(input); return true; } },
    );
    expect(response.status).toBe(202);
    expect(calls).toEqual([{ secret: "test-secret-not-real", token: "tok_abc", ip: "203.0.113.5" }]);
    expect(receiptCount(database)).toBe(1);
  });

  it("with a secret: a missing or refused token is a visible 403 and no order", async () => {
    const { database, env } = await seedShop(10);
    env.TURNSTILE_SECRET = "test-secret-not-real";
    const calls: unknown[] = [];
    const verifyTurnstile = async (input: unknown) => { calls.push(input); return false; };
    const missing = await checkout(checkoutRequest(await honestBody("idem_ts_on_002")), env, SLUG, { ...deps, verifyTurnstile });
    expect(missing.status).toBe(403);
    await expect(missing.json()).resolves.toEqual({ error: "challenge_failed" });
    expect(calls).toEqual([]);
    const refused = await checkout(checkoutRequest(await honestBody("idem_ts_on_003", { turnstileToken: "bad" })), env, SLUG, { ...deps, verifyTurnstile });
    expect(refused.status).toBe(403);
    expect(calls).toHaveLength(1);
    expect(receiptCount(database)).toBe(0);
  });

  it("with a secret: a verifier outage is a 503, never a success", async () => {
    const { database, env } = await seedShop(10);
    env.TURNSTILE_SECRET = "test-secret-not-real";
    const response = await checkout(checkoutRequest(await honestBody("idem_ts_on_004", { turnstileToken: "t" })), env, SLUG, {
      ...deps, verifyTurnstile: async () => { throw new Error("network"); },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "challenge_unavailable" });
    expect(receiptCount(database)).toBe(0);
  });
});
