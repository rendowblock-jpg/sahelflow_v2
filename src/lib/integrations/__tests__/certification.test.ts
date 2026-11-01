import { describe, expect, it } from "vitest";

import { LIVE_CERTIFIED } from "@/lib/integrations/ecommerce/live-certification";

import {
  DELIVERY_PROVIDER_TO_INTEGRATION,
  INTEGRATION_IDS,
  deliveryIntegrationId,
  integrationStatus,
} from "../certification";

// The marketing site's registry is the reference: the app must never say more (or less) than the site does.
const claims = await import("../../../../marketing/src/claims.mjs");
const siteIntegrations = claims.CLAIMS.filter((claim) => claim.kind === "integration");

describe("app integration registry mirrors marketing/src/claims.mjs", () => {
  it("lists exactly the integration ids the site lists", () => {
    expect([...INTEGRATION_IDS].sort()).toEqual(siteIntegrations.map((claim) => claim.id).sort());
  });

  it("gives every integration the same status as the site", () => {
    for (const claim of siteIntegrations) {
      expect(integrationStatus(claim.id as (typeof INTEGRATION_IDS)[number]), claim.id).toBe(claim.status);
    }
  });

  it("only uses the three statuses the site defines", () => {
    for (const id of INTEGRATION_IDS) expect(claims.STATUSES, id).toContain(integrationStatus(id));
  });

  it("treats an id it does not know as in testing, never as live", () => {
    expect(integrationStatus("not-a-real-integration" as never)).toBe("testing");
    // Names that exist on every object must not leak through the lookup.
    expect(integrationStatus("constructor" as never)).toBe("testing");
    expect(integrationStatus("__proto__" as never)).toBe("testing");
  });

  it("agrees with the commerce live-store map: a platform is live in one only if it is live in the other", () => {
    for (const [id, certified] of Object.entries(LIVE_CERTIFIED)) {
      expect(certified, id).toBe(integrationStatus(id as (typeof INTEGRATION_IDS)[number]) === "live");
    }
  });

  it("maps every courier of the delivery panel to a registry id", () => {
    expect(Object.keys(DELIVERY_PROVIDER_TO_INTEGRATION).sort()).toEqual(["ecotrack", "maystro", "yalidine", "zrexpress"]);
    for (const id of Object.values(DELIVERY_PROVIDER_TO_INTEGRATION)) expect(INTEGRATION_IDS).toContain(id);
  });
});

describe("deliveryIntegrationId", () => {
  it("maps the courier ids the app stores on a delivery to registry ids, including the old NOEST name", () => {
    expect(deliveryIntegrationId("yalidine")).toBe("yalidine");
    expect(deliveryIntegrationId("zrexpress")).toBe("zr");
    expect(deliveryIntegrationId("zr_express")).toBe("zr");
    expect(deliveryIntegrationId("ecotrack")).toBe("ecotrack");
    expect(deliveryIntegrationId("maystro")).toBe("maystro");
    expect(deliveryIntegrationId("noest")).toBe("ecotrack");
  });

  it("returns null for a name that is not a courier, and never leaks object property names", () => {
    expect(deliveryIntegrationId("manual")).toBeNull();
    expect(deliveryIntegrationId("")).toBeNull();
    expect(deliveryIntegrationId("constructor")).toBeNull();
    expect(deliveryIntegrationId("__proto__")).toBeNull();
  });
});
