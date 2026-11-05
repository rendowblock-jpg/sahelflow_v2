import { describe, expect, it } from "vitest";

import { STUDIO_PANELS } from "@/components/storefront/studio/studio-rail";

describe("Studio rail: Tracking entry", () => {
  it("lists a tracking panel with its own label key and an icon, once", () => {
    const entries = STUDIO_PANELS.filter((panel) => panel.id === "tracking");
    expect(entries).toHaveLength(1);
    expect(entries[0].labelKey).toBe("storefront.studio.panels.tracking");
    expect(entries[0].icon).toBeTruthy();
  });
  it("keeps every panel id unique and the older panels in place", () => {
    const ids = STUDIO_PANELS.map((panel) => panel.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["sections", "theme", "products", "checkout", "contact", "legal", "seo"]) expect(ids).toContain(id);
  });
});
