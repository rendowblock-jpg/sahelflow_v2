import { describe, expect, it } from "vitest";

import { checkout } from "./checkout";
import { pollReceipts } from "./receipts";
import { clientAddress, MAX_OPEN_RECEIPTS_PER_SHOP, RECEIPT_RESERVATION_MINUTES, EXPIRED_RESULT_DIGEST } from "./abuse";
import { ITEM, SHOP, SLUG, WORKSPACE, checkoutRequest, honestBody, insertOpenReceipts, receiptCount, remaining, seedShop } from "./abuse-test-support";

describe("a receipt nobody collects stops pinning stock", () => {
  it("pins the numbers: 72 hours, 150 open receipts per shop", () => {
    expect(RECEIPT_RESERVATION_MINUTES).toBe(72 * 60);
    expect(MAX_OPEN_RECEIPTS_PER_SHOP).toBe(150);
    expect(EXPIRED_RESULT_DIGEST).toBe("ee".repeat(32));
  });

  it("gives the units back at 72 hours, not before, and says why in the row", async () => {
    const { database, env } = await seedShop(10);
    for (const key of ["idem_old_0001", "idem_young_001"]) {
      expect((await checkout(checkoutRequest(await honestBody(key, {}, 3)), env, SLUG)).status).toBe(202);
    }
    expect(remaining(database)).toBe(4);
    database.exec("UPDATE storefront_receipt SET created_at = datetime('now', '-4321 minutes') WHERE idempotency_key = 'idem_old_0001'");
    database.exec("UPDATE storefront_receipt SET created_at = datetime('now', '-4319 minutes') WHERE idempotency_key = 'idem_young_001'");
    expect((await checkout(checkoutRequest(await honestBody("idem_third_001")), env, SLUG)).status).toBe(202);
    expect(remaining(database)).toBe(4 + 3 - 1);
    const rows = database.prepare("SELECT idempotency_key AS k, state, result_digest AS d FROM storefront_receipt ORDER BY k").all();
    expect(rows).toEqual([
      { k: "idem_old_0001", state: "rejected", d: "ee".repeat(32) },
      { k: "idem_third_001", state: "received", d: null },
      { k: "idem_young_001", state: "received", d: null },
    ]);
  });

  it("sells the freed stock to the next buyer instead of saying sold out", async () => {
    const { database, env } = await seedShop(3);
    expect((await checkout(checkoutRequest(await honestBody("idem_hold_0001", {}, 3)), env, SLUG)).status).toBe(202);
    expect((await checkout(checkoutRequest(await honestBody("idem_next_0001", {}, 1)), env, SLUG)).status).toBe(409);
    database.exec("UPDATE storefront_receipt SET created_at = datetime('now', '-5000 minutes')");
    expect((await checkout(checkoutRequest(await honestBody("idem_next_0002", {}, 1)), env, SLUG)).status).toBe(202);
  });
});

describe("open receipts per shop", () => {
  it("refuses the 151st open receipt and counts only fresh ones", async () => {
    const { database, env } = await seedShop(10);
    insertOpenReceipts(database, 149);
    expect((await checkout(checkoutRequest(await honestBody("idem_cap_0149")), env, SLUG)).status).toBe(202);
    const refused = await checkout(checkoutRequest(await honestBody("idem_cap_0150")), env, SLUG);
    expect(refused.status).toBe(429);
    await expect(refused.json()).resolves.toEqual({ error: "shop_busy" });
    expect(receiptCount(database)).toBe(150);
    // A replay of an order the shop already holds is still answered (200, the stored receipt).
    expect((await checkout(checkoutRequest(await honestBody("idem_cap_0149")), env, SLUG)).status).toBe(200);
  });

  it("does not count receipts that have expired", async () => {
    const { database, env } = await seedShop(10);
    insertOpenReceipts(database, 150, 5000);
    expect((await checkout(checkoutRequest(await honestBody("idem_cap_fresh")), env, SLUG)).status).toBe(202);
  });
});

describe("per-shop and per-IP limits", () => {
  it("keys the limiters on the shop and on the platform address only", async () => {
    const { env } = await seedShop(10);
    const keys: string[] = [];
    const shopKeys: string[] = [];
    env.CHECKOUT_RATE_LIMITER = { limit: async ({ key }) => { keys.push(key); return { success: true }; } };
    env.CHECKOUT_SHOP_RATE_LIMITER = { limit: async ({ key }) => { shopKeys.push(key); return { success: true }; } };
    const spoof = { "X-Forwarded-For": "9.9.9.9", "X-Real-IP": "8.8.8.8", "True-Client-IP": "7.7.7.7", Forwarded: "for=6.6.6.6" };
    await checkout(checkoutRequest(await honestBody("idem_ip_00001"), { ...spoof, "CF-Connecting-IP": "203.0.113.5" }), env, SLUG);
    await checkout(checkoutRequest(await honestBody("idem_ip_00002"), spoof), env, SLUG);
    await checkout(checkoutRequest(await honestBody("idem_ip_00003"), { ...spoof, "CF-Connecting-IP": "not an address, 1.2.3.4" }), env, SLUG);
    expect(keys).toEqual([
      `checkout:${SLUG}:203.0.113.5`, "checkout-ip:203.0.113.5",
      `checkout:${SLUG}:unknown`,
      `checkout:${SLUG}:unknown`,
    ]);
    expect(shopKeys).toEqual([`checkout-shop:${SLUG}`, `checkout-shop:${SLUG}`, `checkout-shop:${SLUG}`]);
  });

  it("answers 429 when the shop-wide limiter says no, and 429 when the address limiter says no", async () => {
    const { database, env } = await seedShop(10);
    env.CHECKOUT_SHOP_RATE_LIMITER = { limit: async () => ({ success: false }) };
    const shop = await checkout(checkoutRequest(await honestBody("idem_lim_0001"), { "CF-Connecting-IP": "203.0.113.5" }), env, SLUG);
    expect(shop.status).toBe(429);
    await expect(shop.json()).resolves.toEqual({ error: "rate_limited" });
    env.CHECKOUT_SHOP_RATE_LIMITER = { limit: async () => ({ success: true }) };
    env.CHECKOUT_RATE_LIMITER = { limit: async ({ key }) => ({ success: !key.startsWith("checkout-ip:") }) };
    expect((await checkout(checkoutRequest(await honestBody("idem_lim_0002"), { "CF-Connecting-IP": "203.0.113.5" }), env, SLUG)).status).toBe(429);
    expect(receiptCount(database)).toBe(0);
  });

  it("works where the optional shop-wide limiter is not bound", async () => {
    const { env } = await seedShop(10);
    expect(env.CHECKOUT_SHOP_RATE_LIMITER).toBeUndefined();
    expect((await checkout(checkoutRequest(await honestBody("idem_nolim_001")), env, SLUG)).status).toBe(202);
  });

  it("clientAddress trusts CF-Connecting-IP only and only when it is an address", () => {
    const from = (headers: Record<string, string>): string => clientAddress(new Request("https://x.test/", { headers }));
    expect(from({ "CF-Connecting-IP": "203.0.113.5" })).toBe("203.0.113.5");
    expect(from({ "CF-Connecting-IP": "2001:db8::1" })).toBe("2001:db8::1");
    expect(from({ "X-Forwarded-For": "1.1.1.1" })).toBe("unknown");
    expect(from({ "X-Real-IP": "1.1.1.1", "True-Client-IP": "2.2.2.2" })).toBe("unknown");
    expect(from({ "CF-Connecting-IP": "1.1.1.1, 2.2.2.2" })).toBe("unknown");
    expect(from({ "CF-Connecting-IP": "x".repeat(200) })).toBe("unknown");
    expect(ITEM).toContain("product_");
  });
});

describe("the desktop poll does not hand over expired receipts", () => {
  it("expires first, then lists only the fresh receipt", async () => {
    const { database, env } = await seedShop(10);
    insertOpenReceipts(database, 1, 5000, "old");
    insertOpenReceipts(database, 1, 5, "new");
    const url = new URL(`https://store.test/v1/desktop/storefront/receipts?workspaceId=${WORKSPACE}&shopId=${SHOP}`);
    const response = await pollReceipts(new Request(url, { headers: { Authorization: "Bearer desktop" } }), env, url);
    expect(response.status).toBe(200);
    const body = await response.json() as { receipts: Array<{ receiptId: string }> };
    expect(body.receipts.map((receipt) => receipt.receiptId)).toEqual(["rcpt_new_000000"]);
    expect(database.prepare("SELECT state FROM storefront_receipt WHERE receipt_id = 'rcpt_old_000000'").get()).toEqual({ state: "rejected" });
  });
});
