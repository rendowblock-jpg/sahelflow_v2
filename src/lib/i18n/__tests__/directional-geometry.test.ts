import { describe, expect, it } from "vitest";

import {
  resolveInlineSide,
  resolvePanelSide,
  type PhysicalPanelSide,
} from "@/lib/i18n/directional-geometry";

describe("semantic directional geometry", () => {
  it("maps logical inline start/end to the correct physical side", () => {
    expect(resolveInlineSide("start", "ltr")).toBe("left");
    expect(resolveInlineSide("end", "ltr")).toBe("right");
    expect(resolveInlineSide("start", "rtl")).toBe("right");
    expect(resolveInlineSide("end", "rtl")).toBe("left");
  });

  it("never reinterprets callers that deliberately request a physical panel side", () => {
    const physicalSides: PhysicalPanelSide[] = [
      "top",
      "right",
      "bottom",
      "left",
    ];

    for (const side of physicalSides) {
      expect(resolvePanelSide(side, "ltr")).toBe(side);
      expect(resolvePanelSide(side, "rtl")).toBe(side);
    }
  });

  it("resolves semantic panel start/end from reading direction", () => {
    expect(resolvePanelSide("start", "ltr")).toBe("left");
    expect(resolvePanelSide("end", "ltr")).toBe("right");
    expect(resolvePanelSide("start", "rtl")).toBe("right");
    expect(resolvePanelSide("end", "rtl")).toBe("left");
  });
});
