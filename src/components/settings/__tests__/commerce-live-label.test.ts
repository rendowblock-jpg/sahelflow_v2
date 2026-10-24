import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-text contract (like delivery-certification-badge.test.ts): the panel
// pulls in router, dialogs and brand icons, so it is not rendered here.
const root = process.cwd();
const panel = readFileSync(
  join(root, "src/components/settings/commerce-integrations-panel.tsx"),
  "utf8",
);
const locale = (code: "ar" | "fr" | "en") =>
  JSON.parse(
    readFileSync(join(root, `src/lib/i18n/locales/${code}.json`), "utf8"),
  ) as Record<string, string>;

const KEYS = ["integrations.notLiveTested", "integrations.notLiveTestedHint"];
const MODULE = "@/lib/integrations/ecommerce/live-certification";

describe("commerce live-store label: certification map", () => {
  it("marks shopify, woocommerce and youcan as not certified against a live store", async () => {
    const { LIVE_CERTIFIED } = await import(MODULE);
    expect(LIVE_CERTIFIED).toEqual({
      shopify: false,
      woocommerce: false,
      youcan: false,
    });
  });

  it("shows the label on a connected card of each of the three platforms", async () => {
    const { showsNotLiveTestedLabel } = await import(MODULE);
    for (const id of ["shopify", "woocommerce", "youcan"]) {
      expect(showsNotLiveTestedLabel(id, true)).toBe(true);
    }
  });

  it("shows no label on a platform that is not connected", async () => {
    const { showsNotLiveTestedLabel } = await import(MODULE);
    expect(showsNotLiveTestedLabel("shopify", false)).toBe(false);
  });

  it("hides the label once the map says the platform was tested live (injected map)", async () => {
    const { showsNotLiveTestedLabel } = await import(MODULE);
    expect(showsNotLiveTestedLabel("shopify", true, { shopify: true })).toBe(false);
    expect(showsNotLiveTestedLabel("woocommerce", true, { shopify: true })).toBe(true);
  });

  it("keeps the label for a platform the map does not know", async () => {
    const { showsNotLiveTestedLabel } = await import(MODULE);
    expect(showsNotLiveTestedLabel("newshop", true, {})).toBe(true);
  });
});

describe("commerce live-store label: panel and strings", () => {
  it("the panel decides with the certification helper and renders both strings", () => {
    expect(panel).toContain("showsNotLiveTestedLabel(");
    for (const key of KEYS) expect(panel).toContain(`t("${key}")`);
  });

  it("the label names the platform for screen readers", () => {
    expect(panel).toMatch(/sr-only[^\n]*\{definition\.name\}/);
  });

  it("does not touch the connect request: no probe is added by the label", () => {
    expect(panel).not.toMatch(/test-connection|testConnection/);
  });

  it("has the same non-empty keys in ar, fr and en, and Arabic is not a copy of English", () => {
    const [ar, fr, en] = [locale("ar"), locale("fr"), locale("en")];
    for (const key of KEYS) {
      for (const messages of [ar, fr, en]) {
        expect(typeof messages[key]).toBe("string");
        expect((messages[key] ?? "").trim().length).toBeGreaterThan(0);
      }
      expect(ar[key]).not.toBe(en[key]);
      expect(ar[key]).toMatch(/[\u0600-\u06FF]/);
    }
    expect(en["integrations.notLiveTested"]).toBe(
      "Not tested against a live store yet",
    );
  });
});
