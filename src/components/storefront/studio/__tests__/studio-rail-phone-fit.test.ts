import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_PANELS } from "@/components/storefront/studio/studio-rail";

/**
 * The Studio's phone rail is a bottom bar of equal cells. With the Tracking entry it has eight. MEASURED on a test page that uses the
 * real class values and the two fonts the app ships (5 Nov 2026):
 * - when the eight cells shared the width, at 360 px each was 45 px wide, the French labels "Produits" (43.5 px) and "Livraison"
 *   (47.7 px) touched (-0.6 px between them; 5.8 px with the old seven entries), and at 320 px the eighth cell stuck out by 32 px;
 * - 56 px cells (the widest label plus padding) kept 10.4 px between labels but hid the eighth entry completely at 320, 360, 375 and 390 px,
 *   so a seller would see seven tabs filling the bar and no sign of more;
 * - 52 px cells (`min-w-[3.25rem]`) are what the seven-entry bar had at 360 px (51.4 px), so the first seven look as before (6.4 px between
 *   the closest French labels; 12.2 px in Arabic), the bar scrolls sideways, and at 390 px half of the eighth entry shows at the edge
 *   (21 % at 375 px, 92 % at 412 px) as the usual "there is more" hint. The page itself never scrolls sideways at 320 to 412 px.
 * jsdom has no layout, so this pins the two classes and the arithmetic the layout relies on.
 */
const source = readFileSync(path.join(process.cwd(), "src/components/storefront/studio/studio-rail.tsx"), "utf8");
const CELL = 52;

describe("Studio phone rail with eight entries", () => {
  it("scrolls sideways under md instead of squeezing the cells", () => {
    expect(source).toContain("max-md:overflow-x-auto");
  });

  it("gives each cell at least 52 px (3.25rem) under md, above the 44 px touch floor", () => {
    expect(source).toContain("max-md:min-w-[3.25rem]");
    expect(source).not.toContain("max-md:min-w-14");
    expect(source).not.toContain("max-md:min-w-11");
  });

  it("has more entries than fit a 360 px phone at that width, so the scrolling is needed", () => {
    expect(STUDIO_PANELS.length * CELL).toBeGreaterThan(360);
  });

  it("at 375 and 390 px seven cells fit and the eighth shows partly at the edge (the scroll hint)", () => {
    expect(STUDIO_PANELS.length).toBe(8);
    for (const width of [375, 390]) {
      expect(7 * CELL).toBeLessThan(width);
      expect(8 * CELL).toBeGreaterThan(width);
    }
  });
});
