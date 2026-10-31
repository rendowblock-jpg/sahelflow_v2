import { describe, expect, it } from "vitest";

import { LIVE_CERTIFIED } from "@/lib/integrations/ecommerce/live-certification";

import {
  DELIVERY_PROVIDER_TO_INTEGRATION,
  INTEGRATION_IDS,
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
