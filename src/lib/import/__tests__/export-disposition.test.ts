import { describe, expect, it } from "vitest";

import { attachmentContentDisposition } from "@/lib/import/export-disposition";

// attachmentContentDisposition builds the Content-Disposition header of a downloaded export file. A header value can only
// hold characters up to code point 255 (the platform's Headers throws a TypeError on anything above), so a name that is not
// plain printable ASCII, such as the Arabic names of the export routes, is sent as an ASCII fallback in `filename` plus the
// real name in `filename*` (RFC 5987). The "platform" below is the real Headers of the running Node, not a stand-in.
// Not tested: how a browser or WebView2 picks between the two names (it prefers filename*).

/** Builds a header the way a route does, so the real platform check runs. */
function platformAccepts(value: string): boolean {
  try {
    new Response("x", { headers: { "Content-Disposition": value } });
    return true;
  } catch {
    return false;
  }
}

function quotedName(header: string): string | null {
  return /^attachment; filename="([^"]*)"/.exec(header)?.[1] ?? null;
}

function extendedName(header: string): string | null {
  const encoded = /; filename\*=UTF-8''([^;]*)$/.exec(header)?.[1];
  return encoded === undefined ? null : decodeURIComponent(encoded);
}

const ARABIC = ["منتجات", "طلبات", "عملاء", "توصيلات", "مصاريف", "إرجاعات"];

describe("attachmentContentDisposition: plain ASCII names", () => {
  it.each([
    ["products-2026-10-22.csv"],
    ["livraisons-2026-10-22.xlsx"],
    ["my file.csv"],
    ["a;b,c=d.csv"],
    ["report (1) [final] #2 & 3.csv"],
    ["~!@$%^&+-_.csv"],
    ["x"],
  ])("sends %s exactly as before: one quoted filename, no extended name", (name) => {
    const header = attachmentContentDisposition(name, "ignored.csv");
    expect(header).toBe(`attachment; filename="${name}"`);
    expect(header).not.toContain("filename*");
    expect(platformAccepts(header)).toBe(true);
  });

  it("does not look at the fallback when the name is plain", () => {
    expect(attachmentContentDisposition("a.csv", "")).toBe('attachment; filename="a.csv"');
    expect(attachmentContentDisposition("a.csv", "طلبات.csv")).toBe('attachment; filename="a.csv"');
  });
});

describe("attachmentContentDisposition: names the platform would refuse", () => {
  it("control: the platform refuses an Arabic name written straight into a header", () => {
    expect(platformAccepts(`attachment; filename="${ARABIC[0]}-2026-10-22.csv"`)).toBe(false);
  });

  it.each(ARABIC.map((word) => [word]))("accepts the Arabic name %s: ASCII fallback, the real name in filename*, and the header is plain ASCII", (word) => {
    const name = `${word}-2026-10-22.xlsx`;
    const header = attachmentContentDisposition(name, "export-2026-10-22.xlsx");
    expect(platformAccepts(header)).toBe(true);
    expect(header).toMatch(/^[\x20-\x7E]+$/);
    expect(quotedName(header)).toBe("export-2026-10-22.xlsx");
    expect(extendedName(header)).toBe(name);
    expect(header).toBe(`attachment; filename="export-2026-10-22.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`);
  });

  it("writes the extended name as UTF-8 percent-encoding that decodes back, for Latin letters with accents and for emoji too", () => {
    for (const name of ["éàü-2026.csv", "日本語.csv", "طلبات 😀 (1).csv"]) {
      const header = attachmentContentDisposition(name, "export.csv");
      expect(platformAccepts(header)).toBe(true);
      expect(extendedName(header)).toBe(name);
    }
  });

  it("escapes the four characters encodeURIComponent leaves alone and RFC 5987 does not allow in an extended value", () => {
    const header = attachmentContentDisposition("é'(1)*.csv", "e.csv");
    const encoded = /filename\*=UTF-8''(.*)$/.exec(header)?.[1] ?? "";
    expect(encoded).toBe("%C3%A9%27%281%29%2A.csv");
    expect(encoded).not.toMatch(/['()*]/);
    expect(extendedName(header)).toBe("é'(1)*.csv");
  });

  it("does not send a quote or a backslash inside the quoted name, even when the name is ASCII", () => {
    for (const name of ['a"b.csv', "a\\b.csv", 'say "hi".csv']) {
      const header = attachmentContentDisposition(name, name);
      expect(platformAccepts(header)).toBe(true);
      const quoted = quotedName(header) ?? "";
      expect(quoted).not.toMatch(/["\\]/);
      expect(quoted).toBe(name.replace(/["\\]/g, "_"));
      expect(extendedName(header)).toBe(name);
    }
  });

  it("cannot be used to add a header or a second filename: control characters and separators stay inside the encoded value", () => {
    const header = attachmentContentDisposition("a\r\nX-Evil: 1; filename=evil.csv", "a.csv");
    expect(platformAccepts(header)).toBe(true);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/filename\*=/g)).toHaveLength(1);
    expect(quotedName(header)).toBe("a.csv");
    expect(extendedName(header)).toBe("a\r\nX-Evil: 1; filename=evil.csv");
  });

  it("cannot be used through the fallback either: quotes, semicolons and line breaks in it never break out of the quoted name", () => {
    const header = attachmentContentDisposition("طلبات.csv", 'x"; filename*=UTF-8\'\'evil\r\nX-Evil: 1');
    expect(platformAccepts(header)).toBe(true);
    expect(header).not.toMatch(/[\r\n]/);
    expect(header.match(/filename\*=/g)).toHaveLength(1);
    expect(extendedName(header)).toBe("طلبات.csv");
    // Exactly two quotes in the whole header: the pair around the fallback. A quote from the fallback would make four.
    expect(header.match(/"/g)).toHaveLength(2);
    expect(quotedName(header)).not.toMatch(/[\r\n]/);
  });

  // The edges of the "plain" class: printable ASCII from space to tilde, minus the quote and the backslash. Anything just
  // outside it must leave the quoted name and go to the extended one, so the header stays plain ASCII and the platform accepts it.
  it.each([
    ["U+0000", "\0"],
    ["U+001F", "\x1F"],
    ["U+007F (DEL)", "\x7F"],
    ["U+0080", "\x80"],
    ["U+00FF", "\xFF"],
    ["U+0100", "\u0100"],
  ])("sends a name holding %s as an ASCII fallback plus an extended name, never raw", (_label, character) => {
    const name = `a${character}b.csv`;
    const header = attachmentContentDisposition(name, "ab.csv");
    expect(header).toMatch(/; filename\*=UTF-8''/);
    expect(header).toMatch(/^[\x20-\x7E]+$/);
    expect(platformAccepts(header)).toBe(true);
    expect(quotedName(header)).toBe("ab.csv");
    expect(extendedName(header)).toBe(name);
  });

  it.each([[" "], ["!"], ["#"], ["["], ["]"], ["~"]])("keeps the boundary character %j inside a plain name", (character) => {
    const name = `a${character}b.csv`;
    expect(attachmentContentDisposition(name, "ab.csv")).toBe(`attachment; filename="${name}"`);
  });
});

// The whole header of a non-plain name must fit this grammar: one quoted name with no quote, backslash, semicolon or equals
// sign in it, then exactly one extended name made of RFC 5987 attr-chars and percent escapes.
const STRICT = /^attachment; filename="[^"\\;=]*"; filename\*=UTF-8''[A-Za-z0-9!#$&+.^_`|~%-]+$/;

describe("attachmentContentDisposition: the fallback", () => {
  it("replaces every character that is not safe ASCII with an underscore, and keeps the rest", () => {
    const header = attachmentContentDisposition("طلبات.csv", "طلبات-2026.csv");
    expect(quotedName(header)).toBe("_____-2026.csv");
  });

  it("also replaces the semicolon and the equals sign, which a sloppy parser could read as a parameter", () => {
    expect(quotedName(attachmentContentDisposition("طلبات.csv", "a;b=c.csv"))).toBe("a_b_c.csv");
  });

  it.each([
    ["Arabic with a plain fallback", "طلبات-2026-10-22.csv", "orders-2026-10-22.csv"],
    ["a name with a quote and a backslash", 'a"b\\c.csv', "abc.csv"],
    ["a name with a line break and a header", "a\r\nX-Evil: 1.csv", "a.csv"],
    ["a hostile fallback", "طلبات.csv", 'x"; filename*=UTF-8\'\'evil\r\nX: 1'],
    ["emoji", "😀.csv", "emoji.csv"],
  ])("keeps the whole header of %s inside the strict grammar", (_label, name, fallback) => {
    const header = attachmentContentDisposition(name, fallback);
    expect(header).toMatch(STRICT);
    expect(platformAccepts(header)).toBe(true);
    expect(extendedName(header)).toBe(name);
  });

  it("trims the fallback", () => {
    expect(quotedName(attachmentContentDisposition("طلبات.csv", "  orders.csv  "))).toBe("orders.csv");
  });

  it.each([[""], ["   "], ["\t\n"]])("uses the word download when the fallback is empty or blank (%j)", (fallback) => {
    expect(quotedName(attachmentContentDisposition("طلبات.csv", fallback))).toBe("download");
  });

  it("keeps spaces inside the fallback", () => {
    expect(quotedName(attachmentContentDisposition("طلبات.csv", "my orders.csv"))).toBe("my orders.csv");
  });
});

describe("attachmentContentDisposition: odd names", () => {
  it("never throws on text that cannot be percent-encoded (a lone surrogate): it sends the fallback alone", () => {
    const header = attachmentContentDisposition("a\ud800b.csv", "ab.csv");
    expect(header).toBe('attachment; filename="ab.csv"');
    expect(platformAccepts(header)).toBe(true);
  });

  it("answers an empty name with the fallback alone, never with an empty extended name", () => {
    expect(attachmentContentDisposition("", "orders.csv")).toBe('attachment; filename="orders.csv"');
    expect(attachmentContentDisposition("", "")).toBe('attachment; filename="download"');
  });

  // DEL (U+007F) is not printable. The platform would accept it raw, but it has no place in a quoted name: it goes to the
  // extended name, percent-encoded, and the fallback loses it.
  it("treats DEL (U+007F) as not plain: percent-encoded in the extended name, replaced in the fallback", () => {
    const header = attachmentContentDisposition("a\x7Fb.csv", "a\x7Fb.csv");
    expect(platformAccepts(header)).toBe(true);
    expect(quotedName(header)).toBe("a_b.csv");
    expect(header).toContain("%7F");
    expect(extendedName(header)).toBe("a\x7Fb.csv");
  });

  it("treats a name of only control characters as not plain", () => {
    const header = attachmentContentDisposition("\t\r\n", "orders.csv");
    expect(platformAccepts(header)).toBe(true);
    expect(extendedName(header)).toBe("\t\r\n");
  });
});
