// W3b SEC2: esc() removes directional formatting characters but never a mark that real Arabic text uses, and no phone catalog holds one.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogs, LOCALES } from "../src/i18n";
import { esc } from "../src/views/view";

const REMOVED = /[\u202A-\u202E\u2066-\u2069]/;

describe("esc and directional formatting characters", () => {
  it("removes U+202A..U+202E and U+2066..U+2069 and keeps the text around them", () => {
    for (const cp of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(esc(`ab${String.fromCodePoint(cp)}cd`)).toBe("abcd");
    }
    expect(esc("\u202Eevil <b>")).toBe("evil &lt;b&gt;");
  });
  it("keeps U+200E, U+200F and U+061C, and Arabic text, unchanged", () => {
    const arabic = "\u200Fمرحبا \u061Cبك\u200E (١٢٣)";
    expect(esc(arabic)).toBe(arabic);
    expect(esc("\u200F")).toBe("\u200F");
  });
  it("still escapes the five HTML characters", () => {
    expect(esc(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
  it("no phone catalog (ar, fr, en, every screen file) holds a removed character, so the strip cannot eat a translation", () => {
    for (const l of LOCALES) for (const [k, v] of Object.entries(catalogs[l])) expect(REMOVED.test(v), `${l}:${k}`).toBe(false);
    const dir = join(__dirname, "..", "src", "i18n");
    const files = readdirSync(dir).filter((f) => /\.(ar|fr|en)\.ts$|^(ar|fr|en)\.ts$/.test(f));
    expect(files.length).toBeGreaterThanOrEqual(18);
    for (const f of files) expect(REMOVED.test(readFileSync(join(dir, f), "utf8")), f).toBe(false);
  });
});
