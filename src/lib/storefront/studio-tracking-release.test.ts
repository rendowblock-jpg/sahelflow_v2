/**
 * ITEM 2 P1 slice 1, M2: theme.tracking travels draft -> wire -> release artifact -> the cloud's check, and an unset store carries NO key
 * (the deployed worker checks theme keys strictly, so a stray `tracking: {}` would make it refuse a store that never used the feature).
 */
import { describe, expect, it } from "vitest";

import { parseReleaseInput } from "../../../control-plane/storefront/release-input";
import { PUBLIC_TRACKING_PATTERNS, validPublicArtifact } from "../../../control-plane/storefront/shared";
import { oldDraftWithoutLegal, releaseFromDraft } from "./legal-test-fixtures";
import { studioThemeForWire } from "./studio-draft";
import { STOREFRONT_TRACKING_PATTERNS } from "./studio-tracking";

const META = "1234567890123";
const TIKTOK = "CABCDEFGHIJ1";

function draftWith(tracking: unknown) {
  const draft = oldDraftWithoutLegal();
  return { ...draft, theme: { ...draft.theme, ...(tracking === undefined ? {} : { tracking }) } };
}
const artifactOf = (draft: unknown) => releaseFromDraft(draft).publicArtifact as { theme: Record<string, unknown> } & Record<string, unknown>;

describe("release artifact", () => {
  it("carries the block at theme.tracking, outside the builder, with only the ids that are set", () => {
    const artifact = artifactOf(draftWith({ metaPixelId: META, tiktokPixelId: TIKTOK }));
    expect(artifact.theme.tracking).toEqual({ metaPixelId: META, tiktokPixelId: TIKTOK });
    expect("tracking" in (artifact.theme.builder as object)).toBe(false);
    expect(artifactOf(draftWith({ metaPixelId: META, tiktokPixelId: "" })).theme.tracking).toEqual({ metaPixelId: META });
    expect(artifactOf(draftWith({ metaPixelId: "", tiktokPixelId: TIKTOK })).theme.tracking).toEqual({ tiktokPixelId: TIKTOK });
  });

  it("emits NO tracking key when nothing is set: absent, empty block, or only empty strings", () => {
    for (const tracking of [undefined, {}, { metaPixelId: "", tiktokPixelId: "" }]) {
      const artifact = artifactOf(draftWith(tracking));
      expect("tracking" in artifact.theme).toBe(false);
      expect(JSON.stringify(artifact)).not.toContain("tracking");
    }
  });

  it("an unset store publishes byte for byte what it published before the feature (same JSON as the old draft)", () => {
    expect(JSON.stringify(artifactOf(draftWith(undefined)))).toBe(JSON.stringify(artifactOf(oldDraftWithoutLegal())));
    expect(JSON.stringify(artifactOf(draftWith({})))).toBe(JSON.stringify(artifactOf(oldDraftWithoutLegal())));
  });
});

describe("the cloud's check of the artifact", () => {
  const artifactWith = (tracking: unknown) => {
    const artifact = artifactOf(oldDraftWithoutLegal());
    return { ...artifact, theme: { ...artifact.theme, tracking } };
  };

  it("accepts what the Studio publishes, through the whole release input", () => {
    expect(parseReleaseInput(releaseFromDraft(draftWith({ metaPixelId: META, tiktokPixelId: TIKTOK })))).not.toBeNull();
    expect(validPublicArtifact(artifactWith({ metaPixelId: META }))).toBe(true);
    expect(validPublicArtifact(artifactWith({ tiktokPixelId: TIKTOK }))).toBe(true);
  });

  it("still accepts an artifact without tracking", () => {
    expect(parseReleaseInput(releaseFromDraft(oldDraftWithoutLegal()))).not.toBeNull();
    expect(validPublicArtifact(artifactOf(oldDraftWithoutLegal()))).toBe(true);
  });

  it("refuses anything that is not exactly a Meta digits id or a TikTok upper-case id", () => {
    const bad: unknown[] = [
      { metaPixelId: "123456789" },
      { metaPixelId: "123456789012345678901" },
      { metaPixelId: "12345abcde67" },
      { metaPixelId: " 1234567890" },
      { metaPixelId: "1234567890');alert(1);//" },
      { metaPixelId: "<script>alert(1)</script>" },
      { metaPixelId: 1234567890 },
      { metaPixelId: "" },
      { tiktokPixelId: "cabcdefghij1" },
      { tiktokPixelId: "ABCDEFGHI" },
      { tiktokPixelId: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456" },
      { tiktokPixelId: 'CABCDEFGHIJ1"' },
      { tiktokPixelId: "<img src=x onerror=alert(1)>" },
      { tiktokPixelId: null },
      { metaPixelId: META, extra: "x" },
      {},
      [],
      null,
      "1234567890",
    ];
    for (const tracking of bad) expect(validPublicArtifact(artifactWith(tracking)), JSON.stringify(tracking)).toBe(false);
  });

  it("repeats the two shapes of the Studio exactly", () => {
    expect(PUBLIC_TRACKING_PATTERNS).toEqual(STOREFRONT_TRACKING_PATTERNS);
  });
});

describe("studioThemeForWire", () => {
  const draft = (tracking: unknown) => ({ ...oldDraftWithoutLegal(), theme: draftWith(tracking).theme }) as never;

  it("keeps the ids that are set and drops the ones that are empty", () => {
    expect((studioThemeForWire(draft({ metaPixelId: META, tiktokPixelId: "" })) as unknown as { tracking: unknown }).tracking).toEqual({ metaPixelId: META });
  });

  it("writes no tracking key for an empty block, and leaves a draft without it untouched", () => {
    expect("tracking" in studioThemeForWire(draft({ metaPixelId: "", tiktokPixelId: "" }))).toBe(false);
    expect("tracking" in studioThemeForWire(draft({}))).toBe(false);
    const plain = draft(undefined) as { theme: unknown };
    expect(studioThemeForWire(plain as never)).toBe(plain.theme);
  });
});
