/**
 * ITEM 2 P1 slice 1: the OPTIONAL theme.tracking block {metaPixelId?, tiktokPixelId?}.
 * Added to the strict v2 theme schema WITHOUT a version bump (same way builder.contact was added).
 */
import { describe, expect, it } from "vitest";
import { createDefaultStorefrontTheme } from "./theme-default";
import { normalizeStorefrontTheme, switchStorefrontTemplate } from "./theme-normalize";
import { storefrontStudioThemeSchema } from "./studio-schema";

const base = () => createDefaultStorefrontTheme("sahara") as unknown as Record<string, unknown>;
const parse = (tracking: unknown) => storefrontStudioThemeSchema.safeParse({ ...base(), tracking });

const GOOD_META = ["1234567890", "123456789012345", "12345678901234567890"];
const GOOD_TIKTOK = ["CABCDEFGHIJ1", "C4ABCDEF1234567890ABCDEF12345678", "ABCDEFGHIJ"];
const BAD_META = [
  "123456789", // 9 digits: too short
  "123456789012345678901", // 21 digits: too long
  "12345abcde67", // letters
  "1234 567890", // inner space
  " 1234567890", // leading space
  "1234567890 ", // trailing space
  "1234567890\n", // trailing newline
  "'1234567890'", // quotes
  '"1234567890"',
  "1234567890`",
  "<1234567890>", // angle brackets
  "1234567890');alert(1);//", // script text breaking out of a JS string
  "<script>alert(1)</script>",
  "-1234567890",
  "1234567890.5",
  "１２３４５６７８９０", // full-width digits
];
const BAD_TIKTOK = [
  "ABCDEFGHI", // 9: too short
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456", // 33: too long
  "cabcdefghij1", // lowercase
  "CABCDEF GHIJ", // space
  " CABCDEFGHIJ",
  "CABCDEFGHIJ ",
  "CABCDEFGHIJ\n",
  "'CABCDEFGHIJ'",
  '"CABCDEFGHIJ"',
  "<CABCDEFGHIJ>",
  "CABCDEFGHIJ');alert(1);//",
  "<script>alert(1)</script>",
  "CABC-DEFGHIJ", // hyphen
  "CÀBCDEFGHIJ", // accent
];

describe("theme.tracking in the strict v2 theme schema", () => {
  it("is optional: a theme without it still parses, stays schemaVersion 2 and gains no tracking key", () => {
    const parsed = storefrontStudioThemeSchema.safeParse(base());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.schemaVersion).toBe(2);
    expect("tracking" in parsed.data).toBe(false);
  });

  it.each(GOOD_META)("accepts the Meta pixel id %s", (id) => {
    const parsed = parse({ metaPixelId: id });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tracking).toEqual({ metaPixelId: id });
  });

  it.each(GOOD_TIKTOK)("accepts the TikTok pixel id %s", (id) => {
    const parsed = parse({ tiktokPixelId: id });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.tracking).toEqual({ tiktokPixelId: id });
  });

  it("accepts both ids together, an empty block, and empty strings (empty = removed)", () => {
    expect(parse({ metaPixelId: GOOD_META[0], tiktokPixelId: GOOD_TIKTOK[0] }).success).toBe(true);
    expect(parse({}).success).toBe(true);
    expect(parse({ metaPixelId: "", tiktokPixelId: "" }).success).toBe(true);
  });

  it.each(BAD_META)("rejects the Meta pixel id %j", (id) => {
    expect(parse({ metaPixelId: id }).success).toBe(false);
  });

  it.each(BAD_TIKTOK)("rejects the TikTok pixel id %j", (id) => {
    expect(parse({ tiktokPixelId: id }).success).toBe(false);
  });

  it("does not let a Meta id be accepted as a TikTok id or the reverse when the shape differs", () => {
    expect(parse({ tiktokPixelId: "1234567" }).success).toBe(false); // 7 chars
    expect(parse({ metaPixelId: "CABCDEFGHIJ1" }).success).toBe(false); // letters
  });

  it("stays strict: unknown keys, numbers, null and arrays are refused", () => {
    expect(parse({ metaPixelId: GOOD_META[0], extra: "x" }).success).toBe(false);
    expect(parse({ metaPixelId: 1234567890 }).success).toBe(false);
    expect(parse({ metaPixelId: null }).success).toBe(false);
    expect(parse(null).success).toBe(false);
    expect(parse([]).success).toBe(false);
    expect(parse("1234567890").success).toBe(false);
    expect(storefrontStudioThemeSchema.safeParse({ ...base(), somethingElse: 1 }).success).toBe(false);
  });
});

describe("theme.tracking through normalize and template switch", () => {
  it("normalizeStorefrontTheme keeps a valid block", () => {
    const theme = { ...base(), tracking: { metaPixelId: "1234567890", tiktokPixelId: "CABCDEFGHIJ1" } };
    expect(normalizeStorefrontTheme(theme).tracking).toEqual({ metaPixelId: "1234567890", tiktokPixelId: "CABCDEFGHIJ1" });
  });

  it("normalizeStorefrontTheme never lets an invalid id through", () => {
    const theme = { ...base(), tracking: { metaPixelId: "<script>alert(1)</script>" } };
    expect(normalizeStorefrontTheme(theme).tracking).toBeUndefined();
  });

  it("switching template keeps the seller's pixel ids", () => {
    const theme = createDefaultStorefrontTheme("sahara");
    (theme as unknown as Record<string, unknown>).tracking = { metaPixelId: "1234567890" };
    const switched = switchStorefrontTemplate(theme, "atlas");
    expect((switched as unknown as Record<string, unknown>).tracking).toEqual({ metaPixelId: "1234567890" });
  });

  it("switching template of a theme without tracking adds none", () => {
    const switched = switchStorefrontTemplate(createDefaultStorefrontTheme("sahara"), "atlas");
    expect("tracking" in switched).toBe(false);
  });
});
