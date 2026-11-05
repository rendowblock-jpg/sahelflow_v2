import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { STUDIO_PANELS } from "@/components/storefront/studio/studio-rail";

/**
 * The Studio's phone rail is a bottom bar of equal cells. With the Tracking entry it has eight. MEASURED on a test page that uses the
 * real class values and the two fonts the app ships (5 Nov 2026): when the cells shared the width, at 360 px each was 45 px wide, the
 * French labels "Produits" (43.5 px) and "Livraison" (47.7 px) touched (-0.6 px between them; 5.8 px with seven entries), and at 320 px the
 * eighth cell stuck out by 32 px. A cell never narrower than the widest label (47.7 px) plus its 4 px padding on each side = 56 px
 * (`min-w-14`), with the bar scrolling sideways, keeps at least 10 px between neighbouring labels at 390, 360 and 320 px, French and
 * Arabic, and the page itself never scrolls sideways. jsdom has no layout, so this pins the two classes the layout relies on.
 */
const source = readFileSync(path.join(process.cwd(), "src/components/storefront/studio/studio-rail.tsx"), "utf8");

describe("Studio phone rail with eight entries", () => {
  it("scrolls sideways under md instead of squeezing the cells", () => {
    expect(source).toContain("max-md:overflow-x-auto");
  });

  it("gives each cell at least 56 px (3.5rem) under md, above the 44 px touch floor", () => {
    expect(source).toContain("max-md:min-w-14");
    expect(source).not.toContain("max-md:min-w-11");
  });

  it("really has more entries than fit a 360 px phone at that width, so the scrolling is needed", () => {
    expect(STUDIO_PANELS.length * 56).toBeGreaterThan(360);
  });
});
