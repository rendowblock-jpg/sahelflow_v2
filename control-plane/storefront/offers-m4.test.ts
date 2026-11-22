import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { checkout } from "./checkout";
import { resolveCheckoutPricing } from "./checkout-pricing";
import { pollReceipts } from "./receipts";
import { storefrontReceiptAadValue } from "./receipt-protocol";
import { totals } from "./web/client/logic";
import { servePublicStorePage } from "./web/page-route";
import { renderStorePage } from "./web/shop";
import { publishTestStore } from "./web/test-support";
import manifest from "./web/asset-manifest.generated.json";

const OFFERS = JSON.stringify([
  { q: 2, t: 5500 },
  { q: 3, t: 7500 },
]);

async function seedOfferStore(remaining = 10, unitPrice = 3000) {
  const published = await publishTestStore({
    locale: "fr",
    shapeTheme: (theme) => {
      theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 400 }];
    },
  });
  const release = published.database
    .prepare("SELECT release_id AS id, storefront_id AS sf FROM storefront_release")
    .get() as { id: string; sf: string };
  const item = published.database
    .prepare("SELECT item_key AS k FROM storefront_allocation ORDER BY item_key LIMIT 1")
    .get() as { k: string };
  published.database
    .prepare(
      "UPDATE storefront_allocation SET unit_price_dzd = ?, delegated_quantity = ?, remaining_quantity = ?, offers_json = ? WHERE release_id = ? AND item_key = ?",
    )
    .run(unitPrice, remaining, remaining, OFFERS, release.id, item.k);
  return { published, releaseId: release.id, storefrontId: release.sf, itemKey: item.k };
}

async function makeCheckoutBody(input: {
  storefrontId: string;
  releaseId: string;
  itemKey: string;
  quantity: number;
  idempotencyKey: string;
  extra?: Record<string, unknown>;
}) {
  const aadDigest = createHash("sha256")
    .update(
      storefrontReceiptAadValue({
        storefrontId: input.storefrontId,
        releaseId: input.releaseId,
        idempotencyKey: input.idempotencyKey,
        wilayaCode: "16",
        deliveryMode: "home",
      }),
      "utf8",
    )
    .digest("hex");
  const encryptedCustomer = btoa(
    JSON.stringify({ v: 1, iv: btoa("0123456789ab"), ciphertext: btoa("x".repeat(20)), aadDigest }),
  );
  return {
    idempotencyKey: input.idempotencyKey,
    encryptedCustomer,
    wrappedCustomerKey: btoa("k".repeat(24)),
    wilayaCode: "16",
    deliveryMode: "home",
    items: [{ itemKey: input.itemKey, quantity: input.quantity }],
    ...(input.extra ?? {}),
  };
}

describe("Quantity Offers M4: Worker pricing, discounted receipts, parity, and hosted UI", () => {
  it("prices exact tiers, falls back to q * unit for non-tier quantities, enforces stock, and matches client totals()", async () => {
    const { published, releaseId, itemKey } = await seedOfferStore(10, 3000);
    const clientOffers: Array<[number, number]> = [
      [2, 5500],
      [3, 7500],
    ];

    for (const [qty, expectedSub, expectedDiscount, expectedTotal] of [
      [1, 3000, 0, 3400],
      [2, 6000, 500, 5900],
      [3, 9000, 1500, 7900],
      [4, 12000, 0, 12400],
    ] as const) {
      const res = await resolveCheckoutPricing(
        published.env,
        releaseId,
        [{ itemKey, quantity: qty }],
        "16",
        "home",
      );
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.pricing.subtotalDzd).toBe(expectedSub);
        expect(res.pricing.discountDzd).toBe(expectedDiscount);
        expect(res.pricing.shippingDzd).toBe(400);
        expect(res.pricing.totalDzd).toBe(expectedTotal);
        // Client preview total must equal server totalDzd for every tier and non-tier quantity!
        expect(totals(3000, qty, 400, clientOffers).total).toBe(res.pricing.totalDzd);
      }
    }

    // Kill switch disables offer pricing cleanly.
    const disabled = await resolveCheckoutPricing(
      { ...published.env, OFFERS_PRICING_DISABLED: "1" },
      releaseId,
      [{ itemKey, quantity: 2 }],
      "16",
      "home",
    );
    expect(disabled.ok && disabled.pricing.discountDzd).toBe(0);
    expect(disabled.ok && disabled.pricing.totalDzd).toBe(6400);

    // Stock guard still applies before bundle pricing.
    const lowStock = await seedOfferStore(2, 3000);
    const short = await resolveCheckoutPricing(
      lowStock.published.env,
      lowStock.releaseId,
      [{ itemKey: lowStock.itemKey, quantity: 3 }],
      "16",
      "home",
    );
    expect(!short.ok && short.error).toBe("allocation_unavailable");
  });

  it("persists discount_dzd, replays stored totalDzd on idempotency retry, and relays discountDzd only when > 0", async () => {
    const { published, releaseId, storefrontId, itemKey } = await seedOfferStore(10, 3000);
    const sfRow = published.database
      .prepare("SELECT workspace_id AS ws, shop_id AS sh FROM storefront WHERE storefront_id = ?")
      .get(storefrontId) as { ws: string; sh: string };
    const env = {
      ...published.env,
      CONTROL: {
        fetch: async () =>
          Response.json({ workspaceId: sfRow.ws, shopSlots: 1, storefrontActive: true }),
      },
    };

    // Discounted checkout (q=2 -> 5500 + 400 shipping = 5900, discount = 500); client total ignored.
    const body2 = await makeCheckoutBody({
      storefrontId,
      releaseId,
      itemKey,
      quantity: 2,
      idempotencyKey: "ck_offer_bundle_01",
      extra: { totalDzd: 1 },
    });
    const req2 = () =>
      new Request("https://shop.test/v1/storefront/sahel-store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.10" },
        body: JSON.stringify(body2),
      });
    const res2 = await checkout(req2(), env, "sahel-store");
    expect(res2.status).toBe(202);
    const json2 = (await res2.json()) as { receiptId: string; totalDzd: number };
    expect(json2.totalDzd).toBe(5900);

    // Idempotency replay returns the exact stored discounted total.
    const replay2 = await checkout(req2(), env, "sahel-store");
    expect(replay2.status).toBe(200);
    expect(((await replay2.json()) as { totalDzd: number }).totalDzd).toBe(5900);

    // Plain checkout (q=1 -> 3000 + 400 = 3400, discount = 0).
    const body1 = await makeCheckoutBody({
      storefrontId,
      releaseId,
      itemKey,
      quantity: 1,
      idempotencyKey: "ck_offer_plain_01",
    });
    const res1 = await checkout(
      new Request("https://shop.test/v1/storefront/sahel-store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.11" },
        body: JSON.stringify(body1),
      }),
      env,
      "sahel-store",
    );
    expect(res1.status).toBe(202);

    // Poll receipts: discounted receipt carries discountDzd: 500; plain receipt omits discountDzd (Internal.51 compat).
    const pollUrl = `https://shop.test/v1/desktop/receipts?workspaceId=${sfRow.ws}&shopId=${sfRow.sh}`;
    const pollRes = await pollReceipts(
      new Request(pollUrl, { headers: { Authorization: "Bearer test-token" } }),
      env,
      new URL(pollUrl),
    );
    expect(pollRes.status).toBe(200);
    const polled = (await pollRes.json()) as {
      receipts: Array<Record<string, unknown>>;
    };
    const rBundle = polled.receipts.find((r) => r.idempotencyKey === "ck_offer_bundle_01")!;
    const rPlain = polled.receipts.find((r) => r.idempotencyKey === "ck_offer_plain_01")!;
    expect(rBundle.subtotalDzd).toBe(6000);
    expect(rBundle.discountDzd).toBe(500);
    expect(rBundle.shippingDzd).toBe(400);
    expect(rBundle.totalDzd).toBe(5900);
    expect("discountDzd" in rPlain).toBe(false);
    expect(rPlain.totalDzd).toBe(3400);
  });

  it("renders truthful offer ladder radios with struck-through price, savings badge, hidden stepper, and disables tiers above stock", async () => {
    const { published } = await seedOfferStore(2, 3000);
    const response = await servePublicStorePage(
      new Request("https://shop.test/sahel-store/p/product_00000001?lang=ar"),
      published.env,
      "sahel-store",
      undefined,
      { render: renderStorePage, assets: manifest, cache: null },
      "product_00000001",
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-sf="offers"');
    expect(html).toContain('class="sf-qty" hidden');
    expect(html).toContain('class="sf-offer-save"');
    expect(html).toContain("<s>");
    // Remaining stock is 2: q=2 is enabled, q=3 is disabled.
    expect(html).toMatch(/<input type="radio" name="offer" value="2">/);
    expect(html).toMatch(/<input type="radio" name="offer" value="3" disabled>/);
  });
});
