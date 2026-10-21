import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/**
 * Every font file we serve is a subset of an SIL Open Font License font, and a subset is a Modified Version
 * (OFL-FAQ 2.6). The OFL then forbids the font's Reserved Font Names as the name that identifies it (FAQ 5.2,
 * 5.3, 5.4: no whole word of a Reserved Font Name), and requires the copyright and the licence to stay in the file.
 * These tests read the name table of each .woff2 and the Reserved Font Names written in the OFL texts that sit
 * next to it, so a new or re-subsetted font cannot be added with the original name.
 */

const FONTS = join(process.cwd(), "control-plane/storefront/web/fonts");

/** WOFF2 table directory tags, by index (W3C WOFF2 section 5.1). */
const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG",
  "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc",
  "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
];

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}

/** The `name` table records of a .woff2 file: nameID -> every string written for it, in any language. */
function readNameTable(file: string): Map<number, string[]> {
  const data = readFileSync(file);
  if (data.toString("latin1", 0, 4) !== "wOF2") throw new Error(`${file} is not a WOFF2 file`);
  const numTables = data.readUInt16BE(12);
  let cursor = 48;
  const nextByte = (): number => {
    const byte = data[cursor++];
    if (byte === undefined) throw new Error(`${file} ends inside its table directory`);
    return byte;
  };
  const readBase128 = (): number => {
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      const byte = nextByte();
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("bad UIntBase128");
  };
  const tables: { tag: string; length: number }[] = [];
  for (let index = 0; index < numTables; index += 1) {
    const flags = nextByte();
    const tagIndex = flags & 0x3f;
    const version = flags >> 6;
    let tag: string;
    if (tagIndex === 63) {
      tag = data.toString("latin1", cursor, cursor + 4);
      cursor += 4;
    } else {
      const known = KNOWN_TAGS[tagIndex];
      if (known === undefined) throw new Error(`${file} uses unknown table index ${tagIndex}`);
      tag = known;
    }
    const originalLength = readBase128();
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    tables.push({ tag, length: transformed ? readBase128() : originalLength });
  }
  const compressedLength = data.readUInt32BE(20);
  const stream = brotliDecompressSync(data.subarray(cursor, cursor + compressedLength));
  let offset = 0;
  let name: Buffer | undefined;
  for (const table of tables) {
    if (table.tag === "name") name = stream.subarray(offset, offset + table.length);
    offset += table.length;
  }
  if (!name) throw new Error(`${file} has no name table`);

  const count = name.readUInt16BE(2);
  const storage = name.readUInt16BE(4);
  const strings = new Map<number, string[]>();
  for (let index = 0; index < count; index += 1) {
    const record = 6 + index * 12;
    const platform = name.readUInt16BE(record);
    const id = name.readUInt16BE(record + 6);
    const length = name.readUInt16BE(record + 8);
    const start = storage + name.readUInt16BE(record + 10);
    const raw = name.subarray(start, start + length);
    let text: string;
    if (platform === 1) {
      text = raw.toString("latin1");
    } else {
      // UTF-16 big endian: swap the bytes, then read as little endian.
      text = Buffer.from(raw).swap16().toString("utf16le");
    }
    strings.set(id, [...(strings.get(id) ?? []), text]);
  }
  return strings;
}

/** Lower-case words of a name: split on anything that is not a letter or digit and on camelCase joins. */
function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

/** Reserved Font Names declared by the OFL texts that apply to a font folder. */
function reservedNames(directory: string): string[] {
  const names: string[] = [];
  for (const folder of new Set([directory, FONTS])) {
    for (const entry of readdirSync(folder)) {
      if (!/^OFL.*\.txt$/.test(entry)) continue;
      const text = readFileSync(join(folder, entry), "utf8");
      for (const match of text.matchAll(/Reserved Font Names?[ \t]+["“']?([^"”'\r\n.]+?)["”']?(?:[.\r\n]|$)/gi)) {
        names.push((match[1] ?? "").trim());
      }
    }
  }
  return [...new Set(names)];
}

const fontFiles = walk(FONTS).filter((file) => file.endsWith(".woff2")).sort();

describe("font files and the SIL Open Font License", () => {
  it("finds the fonts and reads their name tables", () => {
    expect(fontFiles.length).toBeGreaterThanOrEqual(10);
    const strings = readNameTable(join(FONTS, "prime/jost-var-latin.woff2"));
    expect(strings.get(1)?.join(" ")).toContain("Jost");
  });

  it("reads the Reserved Font Names the OFL texts declare", () => {
    const reel = reservedNames(join(FONTS, "reel"));
    expect(reel).toEqual(expect.arrayContaining(["Plex", "EURM10"]));
    expect(reservedNames(join(FONTS, "souk"))).toContain("RevReading Lexend");
  });

  it("reads only real names from the OFL texts, so the checks below cannot pass on an empty list", () => {
    for (const file of fontFiles) {
      for (const name of reservedNames(dirname(file))) expect(words(name).length).toBeGreaterThan(0);
    }
    // The licence body itself mentions "Reserved Font Name" in prose; none of that prose may be read as a name.
    for (const name of reservedNames(join(FONTS, "reel"))) expect(name.length).toBeLessThan(30);
  });

  for (const file of fontFiles) {
    const label = relative(FONTS, file);

    it(`${label} does not identify itself with a Reserved Font Name`, () => {
      const reserved = reservedNames(dirname(file));
      const strings = readNameTable(file);
      // Family (1), unique id (3), full name (4), PostScript name (6), typographic family and subfamily (16, 17).
      const identity = [1, 3, 4, 6, 16, 17].flatMap((id) => strings.get(id) ?? []);
      const fileName = file.slice(file.lastIndexOf("/") + 1, -".woff2".length);
      const used = new Set([...identity, fileName].flatMap(words));
      for (const name of reserved) {
        for (const word of words(name)) {
          expect(used.has(word), `"${word}" (Reserved Font Name "${name}") is in the name or file name of ${label}`).toBe(false);
        }
      }
    });

    it(`${label} keeps its copyright and licence notice`, () => {
      const strings = readNameTable(file);
      expect((strings.get(0) ?? []).join(" ")).toMatch(/copyright/i);
      expect([...(strings.get(13) ?? []), ...(strings.get(14) ?? [])].join(" ")).toMatch(/open font license|openfontlicense|scripts\.sil\.org\/OFL/i);
    });

    it(`${label} has an OFL text in its folder`, () => {
      const folder = dirname(file);
      const own = readdirSync(folder).some((entry) => /^OFL.*\.txt$/.test(entry));
      expect(own || existsSync(join(FONTS, "OFL.txt"))).toBe(true);
    });
  }
});
