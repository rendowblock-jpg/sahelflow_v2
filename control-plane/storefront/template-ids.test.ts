import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { STOREFRONT_TEMPLATE_IDS } from "../../src/lib/storefront/presentation-types";
import { STOREFRONT_TEMPLATE_PRESETS } from "../../src/lib/storefront/template-presets";
import { createDefaultStorefrontTheme } from "../../src/lib/storefront/theme-default";
import { storefrontStudioThemeSchema } from "../../src/lib/storefront/studio-schema";
import { isTemplateId, TEMPLATE_IDS } from "./shared";

const ROOT = join(process.cwd(), "control-plane/storefront");
const listIn = (sql: string, table: string): string[] => {
  const definition = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?${table} \\([\\s\\S]*?\\n\\);`).exec(sql)?.[0] ?? "";
  const match = /template_id TEXT NOT NULL CHECK\(template_id IN \(([^)]*)\)\)/.exec(definition);
  return (match?.[1] ?? "").split(",").map((item) => item.trim().replace(/'/g, ""));
};

describe("the template id list lives in four places and they stay equal", () => {
  it("the Worker's list equals the app's list (the Worker bundle cannot import from src/, so the copy is checked here)", () => {
    expect([...TEMPLATE_IDS]).toEqual([...STOREFRONT_TEMPLATE_IDS]);
  });

  it("schema.sql, for a new database, allows exactly those ids", () => {
    expect(listIn(readFileSync(join(ROOT, "schema.sql"), "utf8"), "storefront_release")).toEqual([...TEMPLATE_IDS]);
  });

  it("the newest migration, for an existing database, allows exactly those ids", () => {
    expect(listIn(readFileSync(join(ROOT, "migrations/0004_template_ids_five_styles.sql"), "utf8"), "storefront_release")).toEqual([...TEMPLATE_IDS]);
  });

  it("migration 0003 is history: it keeps the six ids it shipped with", () => {
    expect(listIn(readFileSync(join(ROOT, "migrations/0003_template_ids_prime_souk_reel.sql"), "utf8"), "storefront_release")).toEqual(["sahara", "atlas", "oasis", "prime", "souk", "reel"]);
  });

  it.each(TEMPLATE_IDS)("%s: the Studio accepts a default theme of that template and it has a palette", (id) => {
    expect(storefrontStudioThemeSchema.safeParse(createDefaultStorefrontTheme(id)).success).toBe(true);
    expect(STOREFRONT_TEMPLATE_PRESETS[id]).toBeDefined();
  });

  it("the Studio refuses an id outside the list", () => {
    const theme = { ...createDefaultStorefrontTheme("atlas"), template: "vitrine" };
    expect(storefrontStudioThemeSchema.safeParse(theme).success).toBe(false);
  });
});

describe("isTemplateId", () => {
  it.each(TEMPLATE_IDS)("accepts %s", (id) => expect(isTemplateId(id)).toBe(true));

  it.each([
    "", " prime", "Prime", "PRIME", "prime ", "vitrine", "comptoir", "scene", "agora", "kinetic",
    "__proto__", "constructor", "prototype", "toString", "hasOwnProperty", "length", "0", "1",
  ])("refuses %j, including names that exist on every JavaScript object", (value) => {
    expect(isTemplateId(value)).toBe(false);
  });

  it.each([null, undefined, 0, 1, true, {}, [], ["prime"], { toString: () => "prime" }])("refuses the non-string %j", (value) => {
    expect(isTemplateId(value)).toBe(false);
  });
});
