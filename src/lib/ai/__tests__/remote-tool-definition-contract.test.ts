import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Gemini tool-definition privacy contract", () => {
  it("narrows get_conversation_messages to the privacy-safe remote capability", () => {
    const registry = source("src/lib/ai/chat/tools/registry.ts");

    expect(registry).toContain(
      'definition.name === "get_conversation_messages"',
    );
    expect(registry).toContain(
      "Verbatim message body text stays local and is not exposed to the remote model",
    );
    expect(registry).toContain(
      "not exact-message summarization or drafting that requires the customer's original wording",
    );
  });
});
