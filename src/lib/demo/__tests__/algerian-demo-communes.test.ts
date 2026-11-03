import { describe, expect, it } from "vitest";

import communes from "../../../../data/communes.json";
import wilayas from "../../../../data/wilayas.json";
import { ALGERIAN_DEMO_CUSTOMERS } from "../algerian-demo";

/**
 * The demo customers (and the demo orders, which copy the customer's pair) must use the names the pickers list. A
 * customer whose commune is spelled "M'Sila" while the list says "M'sila" pre-filled a blank commune in the order form.
 */
describe("demo customers: wilaya and commune are the exact names in data/", () => {
  it("has the 24 demo customers", () => {
    expect(ALGERIAN_DEMO_CUSTOMERS).toHaveLength(24);
  });

  it("every wilaya is a name in data/wilayas.json", () => {
    const bad = ALGERIAN_DEMO_CUSTOMERS.filter(([, , wilaya]) => !wilayas.some((w) => w.name === wilaya)).map(([name, , wilaya]) => `${name}: ${wilaya}`);
    expect(bad).toEqual([]);
  });

  it("every commune is, exactly, a commune of that customer's wilaya in data/communes.json", () => {
    const bad: string[] = [];
    for (const [name, , wilaya, commune] of ALGERIAN_DEMO_CUSTOMERS) {
      const code = wilayas.find((w) => w.name === wilaya)?.code;
      if (!communes.some((c) => c.wilayaCode === code && c.name === commune)) bad.push(`${name}: ${wilaya} / ${commune}`);
    }
    expect(bad).toEqual([]);
  });

  it("the year demo's fallback pair (Alger / Alger Centre) is canonical too", () => {
    const code = wilayas.find((w) => w.name === "Alger")?.code;
    expect(communes.some((c) => c.wilayaCode === code && c.name === "Alger Centre")).toBe(true);
  });
});
