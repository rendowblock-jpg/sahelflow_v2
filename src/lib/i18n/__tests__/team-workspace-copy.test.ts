import { describe, expect, it } from "vitest";

import {
  getTeamCopy,
  summarizeTeamAccess,
  TEAM_COPY_CATALOG,
} from "@/lib/i18n/team-workspace";
import { getPhase2PresetPermissions } from "@/lib/identity/permissions";

describe("team workspace copy", () => {
  it("carries the same keys and placeholders in every language", () => {
    const english = TEAM_COPY_CATALOG.en;
    for (const locale of ["fr", "ar"] as const) {
      const catalog = TEAM_COPY_CATALOG[locale];
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(english)) {
        const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
        expect(placeholders(catalog[key] ?? ""), `${locale}:${key}`).toEqual(placeholders(value));
      }
    }
  });

  it("interpolates parameters", () => {
    expect(getTeamCopy("fr", "team.seats", { active: 3, limit: 10 })).toBe("3 membres sur 10");
  });

  it("describes each role preset area by area", () => {
    const operator = summarizeTeamAccess(getPhase2PresetPermissions("operator"));
    const byArea = Object.fromEntries(operator.map(({ area, access }) => [area.id, access]));
    expect(byArea).toMatchObject({ orders: "edit", inbox: "edit", products: "view" });
    expect(byArea).not.toHaveProperty("accounting");
    expect(byArea).not.toHaveProperty("analytics");

    const viewer = summarizeTeamAccess(getPhase2PresetPermissions("viewer"));
    expect(viewer.every(({ access }) => access === "view")).toBe(true);
  });
});
