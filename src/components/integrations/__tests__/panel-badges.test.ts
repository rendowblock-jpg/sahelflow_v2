import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("the four settings panels carry the badge, read from the registry", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), "src/components/settings", file), "utf8");
  // The delivery row reaches the chip through ProviderHeading (which renders <TestingBadge> itself, see below).
  const expectations: Array<[string, string, RegExp]> = [
    ["delivery-credentials-panel.tsx", "@/components/integrations/provider-heading", /<ProviderHeading[\s\S]{0,400}?integration=\{DELIVERY_PROVIDER_TO_INTEGRATION\[provider\.id\]\}/],
    ["commerce-integrations-panel.tsx", "@/components/integrations/testing-badge", /<TestingBadge integration=\{definition\.id\}/],
    ["google-sheets-bridge-panel.tsx", "@/components/integrations/testing-badge", /<TestingBadge integration="sheets"/],
    ["meta-pixel-panel.tsx", "@/components/integrations/testing-badge", /<TestingBadge integration="meta"/],
  ];
  for (const [file, importPath, pattern] of expectations) {
    it(`${file} renders the chip for its integration`, () => {
      const source = read(file);
      expect(source).toContain(`from "${importPath}"`);
      expect(source).toMatch(pattern);
    });
  }

  it("ProviderHeading renders <TestingBadge integration={integration}> next to the name", () => {
    const source = readFileSync(join(process.cwd(), "src/components/integrations/provider-heading.tsx"), "utf8");
    expect(source).toMatch(/<TestingBadge integration=\{integration\}/);
  });
});
