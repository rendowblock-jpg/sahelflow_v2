import { describe, expect, it } from "vitest";

import { GROQ_API_KEY_SECRET } from "../catalog";

describe("Groq secret name", () => {
  // Gemini's secret is gemini_api_key. Same style, so the secrets store and the
  // audit trail read alike; nothing has ever written the old hyphenated name.
  it("is groq_api_key, written like gemini_api_key", () => {
    expect(GROQ_API_KEY_SECRET).toBe("groq_api_key");
  });
});
