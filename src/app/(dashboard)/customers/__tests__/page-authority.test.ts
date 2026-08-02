import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("customer dashboard page authority", () => {
  it("guards and projects the direct customer list read", () => {
    const page = source("src/app/(dashboard)/customers/page.tsx");

    expect(page).toContain('requireTrustedAction("customers.read")');
    expect(page).toContain("projectCustomersForTrustedActor");
    expect(page).toContain('"customers.manage"');
    expect(page).toContain('"customers.contact.update"');
    expect(page).toContain('"customers.contact.read"');
    expect(page).toContain('"data.export"');
    expect(page).toContain('"data.import"');
  });

  it("projects detail contact and denies order/risk side reads by default", () => {
    const page = source("src/app/(dashboard)/customers/[id]/page.tsx");

    expect(page).toContain('requireTrustedAction("customers.read")');
    expect(page).toContain("projectCustomerForTrustedActor");
    expect(page).toContain("projectOrderForTrustedActor");
    expect(page).toContain('"orders.read"');
    expect(page).toContain('"orders.financials.read"');
    expect(page).toContain('"risk.read"');
    expect(page).toContain('"risk.manage"');
  });
});
