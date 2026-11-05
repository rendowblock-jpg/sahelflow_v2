import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { parseReleaseInput } from "../../../control-plane/storefront/release-input";
import { createStorefrontReleaseInput, storefrontReleaseItemKey } from "./release-artifact";
import { createDefaultStorefrontTheme } from "./theme-default";

const A = "product_12345678"; // 3000 DA, no variants
const B = "product_87654321"; // product price 2000, two variants
const V1 = "variant_00000001"; // price null -> 2000
const V2 = "variant_00000002"; // 2500
const KEY_A = storefrontReleaseItemKey(A, null);
const KEY_V1 = storefrontReleaseItemKey(B, V1);
const KEY_V2 = storefrontReleaseItemKey(B, V2);

type Offers = ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>;

function build(offersByItemKey?: Offers): Record<string, unknown> {
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  return createStorefrontReleaseInput({
    workspaceId: "0123456789abcdef0123456789abcdef",
    releaseId: "release_12345678",
    parentReleaseId: null,
    locale: "ar",
    draft: { name: "Shop", slug: "shop-test", description: "", theme, selectedProductIds: [A, B], isActive: true },
    products: [
      { id: A, name: "Product A", sku: "SKU-A", images: null, price: 3_000, stock: 10, productVariants: [] },
      {
        id: B, name: "Product B", sku: null, images: null, price: 2_000, stock: 0,
        productVariants: [
          { id: V1, name: "Red", price: null, stock: 5, isActive: true },
          { id: V2, name: "Blue", price: 2_500, stock: 4, isActive: true },
        ],
      },
    ],
    ...(offersByItemKey ? { offersByItemKey } : {}),
  } as Parameters<typeof createStorefrontReleaseInput>[0]);
}

function allocationsOf(request: Record<string, unknown>) {
  return request.allocations as Array<Record<string, unknown>>;
}

/** Everything the offers feature must not move: the request without the (large, separately owned) theme. */
function withoutTheme(request: Record<string, unknown>): string {
  const artifact = request.publicArtifact as Record<string, unknown>;
  return JSON.stringify({ ...request, publicArtifact: { ...artifact, theme: undefined } });
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const PIN_ALLOCATIONS =
  `[{"itemKey":"${KEY_A}","unitPriceDzd":3000,"quantity":10},` +
  `{"itemKey":"${KEY_V1}","unitPriceDzd":2000,"quantity":5},` +
  `{"itemKey":"${KEY_V2}","unitPriceDzd":2500,"quantity":4}]`;
// sha256 of withoutTheme(build()) measured on the builder BEFORE the offers change.
const PIN_REQUEST_SHA256 = "ee317498f036ab3700d96d727ee56173"; // first 32 hex chars

describe("release input without offers is byte-identical to the pre-offers builder", () => {
  it("no map: allocations are exactly price + quantity", () => {
    expect(JSON.stringify(allocationsOf(build()))).toBe(PIN_ALLOCATIONS);
  });

  it("no map: the whole request (theme aside) hashes to the pre-offers value", () => {
    expect(sha256(withoutTheme(build())).slice(0, 32)).toBe(PIN_REQUEST_SHA256);
  });

  it.each([
    ["an empty Map", new Map<string, unknown>()],
    ["an empty object", {}],
    ["a Map of empty ladders", new Map<string, unknown>([[KEY_A, []], [KEY_V2, []]])],
    ["an entry that is undefined", { [KEY_A]: undefined }],
  ] as Array<[string, Offers]>)("%s changes nothing", (_name, map) => {
    expect(JSON.stringify(build(map))).toBe(JSON.stringify(build()));
  });
});

describe("release input with offers", () => {
  const ladderA = [{ q: 2, t: 5_500 }, { q: 3, t: 7_500 }];

  it("emits the ladder only on the item that has one and leaves the rest of the request untouched", () => {
    const request = build(new Map([[KEY_A, Object.freeze(ladderA.map((tier) => Object.freeze({ ...tier })))]]));
    const [a, v1, v2] = allocationsOf(request);
    expect(a).toEqual({ itemKey: KEY_A, unitPriceDzd: 3000, quantity: 10, offers: ladderA });
    expect(Object.keys(v1 ?? {})).toEqual(["itemKey", "unitPriceDzd", "quantity"]);
    expect(Object.keys(v2 ?? {})).toEqual(["itemKey", "unitPriceDzd", "quantity"]);
    expect(withoutTheme({ ...request, allocations: [] })).toBe(withoutTheme({ ...build(), allocations: [] }));
  });

  it("a plain object keyed by itemKey works like a Map, and the worker-side parser keeps the ladder", () => {
    const request = build({ [KEY_A]: ladderA });
    expect(JSON.stringify(request)).toBe(JSON.stringify(build(new Map([[KEY_A, ladderA]]))));
    const parsed = parseReleaseInput(request);
    expect(parsed?.allocations[0]?.offers).toEqual(ladderA);
    expect(parsed?.allocations[1]?.offers).toBeUndefined();
  });

  it("checks each ladder against ITS item's price (a variant's own price, not the product's)", () => {
    const ladder = [{ q: 2, t: 4_500 }]; // < 2 x 2500 (V2) but >= 2 x 2000 (V1)
    expect(allocationsOf(build(new Map([[KEY_V2, ladder]])))[2]?.offers).toEqual(ladder);
    expect(() => build(new Map([[KEY_V1, ladder]]))).toThrow("Published storefront offer ladder is invalid");
  });

  it("copies the tiers: later changes to the caller's array do not reach the request", () => {
    const mutable = [{ q: 2, t: 5_500 }];
    const request = build(new Map([[KEY_A, mutable]]));
    mutable.splice(0, 1, { q: 2, t: 1 });
    expect(allocationsOf(request)[0]?.offers).toEqual([{ q: 2, t: 5_500 }]);
  });

  it("ignores an entry whose item is not part of this release (a stale draft entry cannot block a publish or add a row)", () => {
    const stale = storefrontReleaseItemKey("product_99999999", null);
    expect(JSON.stringify(build(new Map([[stale, [{ q: 2, t: 1 }, { q: 1, t: 0 }]]])))).toBe(JSON.stringify(build()));
  });

  it.each([
    ["null", null],
    ["a string", "2:5500"],
    ["an object, not a list", { q: 2, t: 5_500 }],
    ["quantity 1", [{ q: 1, t: 2_000 }]],
    ["a bundle not cheaper than singles", [{ q: 2, t: 6_000 }]],
    ["a decimal total", [{ q: 2, t: 5_500.5 }]],
    ["a string total", [{ q: 2, t: "5500" }]],
    ["quantities not increasing", [{ q: 3, t: 7_500 }, { q: 2, t: 5_500 }]],
    ["an extra key", [{ q: 2, t: 5_500, label: "x" }]],
    ["six tiers", [2, 3, 4, 5, 6, 7].map((q) => ({ q, t: q * 2_000 }))],
  ] as Array<[string, unknown]>)("an invalid ladder (%s) makes the publish throw", (_name, ladder) => {
    expect(() => build(new Map([[KEY_A, ladder]]))).toThrow("Published storefront offer ladder is invalid");
  });
});
