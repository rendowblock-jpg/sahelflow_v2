import { describe, expect, it } from "vitest";

import { resolveCheckoutPricing } from "./checkout-pricing";
import { publishTestStore } from "./web/test-support";

type Mode = "home" | "desk";
type Rule = { wilayaCode: string; deliveryMode: Mode; feeDzd: number };

async function store(rules: Rule[]) {
  const published = await publishTestStore({
    shapeTheme: (theme) => {
      theme.builder.shippingRules = rules;
    },
  });
  const release = published.database.prepare("SELECT release_id AS id FROM storefront_release").get() as { id: string };
  const item = published.database.prepare("SELECT item_key AS k FROM storefront_allocation ORDER BY item_key LIMIT 1").get() as { k: string };
  return {
    price: (wilaya: string, mode: Mode) =>
      resolveCheckoutPricing(published.env, release.id, [{ itemKey: item.k, quantity: 1 }], wilaya, mode),
  };
}

describe("checkout shipping fee for the new wilayas (STORE-WILAYA69 step A)", () => {
  it("prices a buyer in a new wilaya on the mother's fee when the release has no rule for it", async () => {
    const s = await store([{ wilayaCode: "03", deliveryMode: "home", feeDzd: 600 }]);
    const result = await s.price("59", "home");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pricing.shippingDzd).toBe(600);
      expect(result.pricing.totalDzd).toBe(result.pricing.subtotalDzd + 600);
    }
  });

  it("uses the seller's own rule for the new wilaya before the mother's", async () => {
    const s = await store([
      { wilayaCode: "03", deliveryMode: "home", feeDzd: 600 },
      { wilayaCode: "59", deliveryMode: "home", feeDzd: 900 },
    ]);
    const result = await s.price("59", "home");
    expect(result.ok && result.pricing.shippingDzd).toBe(900);
  });

  it("falls back per delivery mode and does not invent a mode the mother does not have", async () => {
    const s = await store([{ wilayaCode: "03", deliveryMode: "home", feeDzd: 600 }]);
    expect((await s.price("59", "desk")).ok).toBe(false);
    const missing = await s.price("59", "desk");
    expect(!missing.ok && missing.error).toBe("delivery_unavailable");
  });

  it("serves both new wilayas of Djelfa (65, 66) on Djelfa's fee", async () => {
    const s = await store([{ wilayaCode: "17", deliveryMode: "home", feeDzd: 700 }]);
    for (const wilaya of ["65", "66"]) {
      const result = await s.price(wilaya, "home");
      expect(result.ok && result.pricing.shippingDzd).toBe(700);
    }
  });

  it("does not borrow for a new wilaya whose mother is not priced, nor for an old wilaya, nor for a mother from her child", async () => {
    const s = await store([
      { wilayaCode: "16", deliveryMode: "home", feeDzd: 500 },
      { wilayaCode: "59", deliveryMode: "home", feeDzd: 900 },
    ]);
    const noMother = await s.price("60", "home");
    expect(!noMother.ok && noMother.error).toBe("delivery_unavailable");
    const oldWilaya = await s.price("31", "home");
    expect(!oldWilaya.ok && oldWilaya.error).toBe("delivery_unavailable");
    const motherFromChild = await s.price("03", "home");
    expect(!motherFromChild.ok && motherFromChild.error).toBe("delivery_unavailable");
  });

  it("leaves the price of an ordinary wilaya untouched", async () => {
    const s = await store([{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }]);
    const result = await s.price("16", "home");
    expect(result.ok && result.pricing.shippingDzd).toBe(500);
  });
});
