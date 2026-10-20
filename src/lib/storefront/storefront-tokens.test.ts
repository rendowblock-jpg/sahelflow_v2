import { describe, expect, it } from "vitest";

import { STOREFRONT_TEMPLATE_PRESETS } from "./template-presets";
import { contrastRatio, storefrontThemeStyle, type StorefrontPalette } from "./storefront-tokens";

const WCAG_AA = 4.5;

/** Every surface a store paints secondary text on: the page, a card, the tinted pill or chip, the muted band. */
const SURFACES = ["--background", "--card", "--accent", "--muted"] as const;

function tokens(palette: StorefrontPalette): Record<string, string> {
  return storefrontThemeStyle(palette) as unknown as Record<string, string>;
}

/** Palettes a seller could pick in the Studio besides the three presets. */
const CUSTOM_PALETTES: Record<string, StorefrontPalette> = {
  "dark store": {
    primaryColor: "#38BDF8",
    accentColor: "#F59E0B",
    backgroundColor: "#0B0F14",
    surfaceColor: "#151B23",
    textColor: "#E5E7EB",
  },
  "deep red on cream": {
    primaryColor: "#9B1C1C",
    accentColor: "#FBBF24",
    backgroundColor: "#FFFBEB",
    surfaceColor: "#FFFFFF",
    textColor: "#1F1410",
  },
  "saturated teal": {
    primaryColor: "#0F766E",
    accentColor: "#FB7185",
    backgroundColor: "#F0FDFA",
    surfaceColor: "#FFFFFF",
    textColor: "#134E4A",
  },
};

const PALETTES: Record<string, StorefrontPalette> = { ...STOREFRONT_TEMPLATE_PRESETS, ...CUSTOM_PALETTES };

describe("storefront tokens: secondary text", () => {
  describe.each(Object.entries(PALETTES))("%s", (_name, palette) => {
    const vars = tokens(palette);

    it.each(SURFACES)("reaches WCAG AA (4.5:1) on %s", (surface) => {
      const ratio = contrastRatio(vars["--muted-foreground"] as string, vars[surface] as string);
      expect(ratio, `muted ${vars["--muted-foreground"]} on ${surface} ${vars[surface]}`).toBeGreaterThanOrEqual(WCAG_AA);
    });
  });

  it("stays softer than the main text, so the hierarchy survives", () => {
    for (const [name, palette] of Object.entries(PALETTES)) {
      const vars = tokens(palette);
      expect(vars["--muted-foreground"]?.toLowerCase(), name).not.toBe(palette.textColor.toLowerCase());
    }
  });
});
