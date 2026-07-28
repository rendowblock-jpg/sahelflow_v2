import { describe, expect, it } from "vitest";

import { projectLegacyOrderAuthority } from "../legacy-order-projection";

describe("legacy confirmation projection", () => {
  it.each(["shipped", "delivered", "refused", "returned"] as const)(
    "does not manufacture confirmation authority for imported %s orders",
    (status) => {
      const projection = projectLegacyOrderAuthority({
        status,
        confirmedAt: null,
        codCollected: false,
        codRemitted: false,
      });

      expect(projection.confirmation).toMatchObject({
        value: "confirmed",
        certainty: "ambiguous",
      });
      expect(projection.confirmation.reason).toContain("imported directly");
      expect(projection.provenFactIds).toEqual([]);
    },
  );

  it("recognizes the governed legacy confirmation timestamp without inventing canonical facts", () => {
    const projection = projectLegacyOrderAuthority({
      status: "shipped",
      confirmedAt: new Date("2026-07-28T03:30:00.000Z"),
      codCollected: false,
      codRemitted: false,
    });

    expect(projection.confirmation).toMatchObject({
      value: "confirmed",
      certainty: "deterministic",
    });
    expect(projection.provenFactIds).toEqual([]);
  });
});
