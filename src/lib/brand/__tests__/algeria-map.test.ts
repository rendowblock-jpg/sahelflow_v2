import { describe, expect, it } from "vitest";

import {
  ALGERIA_CITIES,
  ALGERIA_LIVE_ROUTES,
  algeriaArcPath,
  algeriaMapDots,
  algeriaOutlinePath,
  projectAlgeria,
} from "../algeria-map";

describe("Algeria live-map geometry", () => {
  it("places Algiers north of Tamanrasset and west of Annaba", () => {
    const [ax, ay] = projectAlgeria(ALGERIA_CITIES.algiers);
    const [tx, ty] = projectAlgeria(ALGERIA_CITIES.tamanrasset);
    const [nx] = projectAlgeria(ALGERIA_CITIES.annaba);
    expect(ay).toBeLessThan(ty);
    expect(ax).toBeLessThan(nx);
    expect(tx).toBeGreaterThan(0);
  });

  it("draws a closed outline and lifted arcs from Algiers", () => {
    const outline = algeriaOutlinePath();
    expect(outline.startsWith("M")).toBe(true);
    expect(outline.endsWith("Z")).toBe(true);
    const arc = algeriaArcPath("algiers", "oran");
    expect(arc).toContain("Q");
    expect(ALGERIA_LIVE_ROUTES).toContain("oran");
    expect(ALGERIA_LIVE_ROUTES).toEqual(
      expect.arrayContaining(["tindouf", "illizi", "eloued", "tamanrasset"]),
    );
    expect(algeriaMapDots(0.8).length).toBeGreaterThan(40);
  });
});
