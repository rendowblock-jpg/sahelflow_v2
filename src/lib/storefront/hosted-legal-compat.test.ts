import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { oldDraftWithoutLegal, releaseFromDraft } from "./legal-test-fixtures";

/** Taken from the code as it was BEFORE the legal pages (base 5be18df9): a draft with no `legal` key must publish the same bytes. */
const FROZEN_DIGEST = "170a110267c80979dc696cd82a87beedb5ebc38becbfa44c5a9791f8d754da9b";

describe("releases published before the legal pages", () => {
  it("an old draft publishes byte for byte what it published before", () => {
    const input = releaseFromDraft(oldDraftWithoutLegal());
    expect(Object.keys(input.publicArtifact as Record<string, unknown>)).not.toContain("legal");
    expect(createHash("sha256").update(JSON.stringify(input)).digest("hex")).toBe(FROZEN_DIGEST);
  });
});
