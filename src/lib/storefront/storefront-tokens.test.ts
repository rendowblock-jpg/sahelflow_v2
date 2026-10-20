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
  // The seller's own text colour is already too faint for their card: a clearer colour must win, not the faint one.
  "text too faint for its card (dark)": {
    primaryColor: "#38BDF8",
    accentColor: "#F59E0B",
    backgroundColor: "#0B0F14",
    surfaceColor: "#2A3340",
    textColor: "#8A94A3",
  },
  "text too faint for its card (light)": {
    primaryColor: "#0F766E",
    accentColor: "#F59E0B",
    backgroundColor: "#FFFFFF",
    surfaceColor: "#E5E5E5",
    textColor: "#6B6B6B",
  },
  // Each palette below passes only if that ONE surface is checked: drop it from the call and the muted text falls under 4.5:1 on it.
  "the card decides (light)": {
    primaryColor: "#BD841B",
    accentColor: "#F59E0B",
    backgroundColor: "#F8F7FB",
    surfaceColor: "#E3E2EB",
    textColor: "#4C474B",
  },
  "the card decides (dark)": {
    primaryColor: "#77C757",
    accentColor: "#F59E0B",
    backgroundColor: "#080810",
    surfaceColor: "#29292E",
    textColor: "#9B949B",
  },
  "the pill tint decides": {
    primaryColor: "#8A1378",
    accentColor: "#F59E0B",
    backgroundColor: "#FAF4FA",
    surfaceColor: "#EAE9EB",
    textColor: "#484047",
  },
  "the muted band decides": {
    primaryColor: "#28F99E",
    accentColor: "#F59E0B",
    backgroundColor: "#FAF6F7",
    surfaceColor: "#F8F0F9",
    textColor: "#212124",
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

  it("never reads stronger than the main text, so the hierarchy survives", () => {
    let compared = 0;
    for (const [name, palette] of Object.entries(PALETTES)) {
      const vars = tokens(palette);
      const textReadsEverywhere = SURFACES.every(
        (surface) => contrastRatio(palette.textColor, vars[surface] as string) >= WCAG_AA,
      );
      // A text colour that is itself too faint on some surface is what the fallback exists to correct: the muted
      // colour may then be clearer than it. Only a text colour that already reads sets the ceiling.
      if (!textReadsEverywhere) continue;
      compared += 1;
      const background = vars["--background"] as string;
      const muted = contrastRatio(vars["--muted-foreground"] as string, background);
      const text = contrastRatio(palette.textColor, background);
      // Equal is allowed: when the main text is already the dimmest colour that passes, muted IS that colour.
      expect(muted, `${name}: muted ${muted.toFixed(2)}:1 must not exceed the main text ${text.toFixed(2)}:1`).toBeLessThanOrEqual(
        text + 0.01,
      );
    }
    expect(compared, "the hierarchy check must compare real palettes, not skip them all").toBeGreaterThanOrEqual(5);
  });
});
