import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AI operational launchpad", () => {
  it("does not treat an HTTP 200 provider failure as a completed focused session", () => {
    const launchpad = read("src/components/ai/ai-operational-launchpad.tsx");
    expect(launchpad).toContain("type AiMessageResponse");
    expect(launchpad).toContain("messageBody.error");
    expect(launchpad).toContain("messageBody.persisted !== true");
    expect(launchpad).toContain("!messageBody.response");
    expect(launchpad).toContain('return copy("providerDegraded")');
    expect(launchpad.indexOf("messageBody.error")).toBeLessThan(
      launchpad.indexOf('window.location.assign("/agents")'),
    );
  });
});
