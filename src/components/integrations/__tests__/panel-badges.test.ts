import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("the four settings panels carry the badge, read from the registry", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), "src/components/settings", file), "utf8");
  const expectations: Array<[string, RegExp]> = [
    ["delivery-credentials-panel.tsx", /<TestingBadge integration=\{DELIVERY_PROVIDER_TO_INTEGRATION\[provider\.id\]\}/],
    ["commerce-integrations-panel.tsx", /<TestingBadge integration=\{definition\.id\}/],
    ["google-sheets-bridge-panel.tsx", /<TestingBadge integration="sheets"/],
    ["meta-pixel-panel.tsx", /<TestingBadge integration="meta"/],
  ];
  for (const [file, pattern] of expectations) {
    it(`${file} renders <TestingBadge> for its integration`, () => {
      const source = read(file);
      expect(source).toContain('from "@/components/integrations/testing-badge"');
      expect(source).toMatch(pattern);
    });
  }
});
