// W5 SEC2 (W4SEC-08): the phone app draws whole screens as HTML strings. One ${...} that is not escaped is a DOM XSS in the origin that
// holds the device token. This contract reads the SOURCE of every screen (views, app, kit) and fails when a template that builds HTML
// writes a name into the page without esc() / tr() / numText(), unless the name is a `const` whose initializer is itself safe, a
// parameter of an HTML helper (whose call sites are read too), or on the short ALLOW list in html-escape-scan.ts (each with a reason).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOW, DATA_BUILDERS, ESCAPERS, GLOBAL_ALLOW, HTML_HELPERS, contractViolations } from "./html-escape-scan";

const SRC = join(__dirname, "..", "src");
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
const files = ["views", "app", "kit"].flatMap((dir) => walk(join(SRC, dir)).map((f) => ({ name: `${dir}/${f.slice(join(SRC, dir).length + 1).replace(/\\/g, "/")}`, src: readFileSync(f, "utf8") })));
const all = files.map((f) => f.src).join("\n");
const read = (name: string): string => (files.find((f) => f.name === name) ?? { src: "" }).src;

describe("every ${} in a screen template is escaped", () => {
  it("scans the real screens (a vacuous scan would pass)", () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
    expect(files.filter((f) => /<\/?[a-z]/.test(f.src) && f.src.includes("${")).length).toBeGreaterThanOrEqual(15);
  });
  it("today's screens have no unescaped interpolation", () => {
    expect(files.flatMap((f) => contractViolations(f.name, f.src))).toEqual([]);
  });
  it("the helper lists name only functions that exist in the scanned folders, and every ALLOW entry has a real reason", () => {
    for (const n of [...DATA_BUILDERS, ...HTML_HELPERS, ...ESCAPERS.filter((e) => !e.includes("."))]) {
      if (n === "formatNumber") continue; // lives in src/i18n (digits and separators only)
      expect(new RegExp(`(?:function|const)\\s+${n}\\b`).test(all), `${n} is not defined in views, app or kit`).toBe(true);
    }
    for (const [file, names] of Object.entries(ALLOW)) {
      expect(read(file), `${file} does not exist`).not.toBe("");
      for (const [name, why] of Object.entries(names)) expect(why.length, `${file}: ${name}`).toBeGreaterThan(20);
    }
    for (const [name, why] of Object.entries(GLOBAL_ALLOW)) expect(why.length, name).toBeGreaterThan(5);
  });
  it("every local tr() escapes", () => {
    const defs = all.split("\n").filter((l) => /\b(?:const|let)\s+tr\b/.test(l));
    expect(defs.length).toBeGreaterThanOrEqual(2);
    for (const l of defs) expect(l, "tr must wrap esc()").toContain("esc(");
  });
});

describe("the contract catches what it is meant to catch (positive controls)", () => {
  const bad = (src: string): string[] => contractViolations("views/x.ts", src);
  it("flags a raw field, a raw local and a raw field inside a list callback", () => {
    expect(bad("const a = (m) => `<p>${m.text}</p>`;").length).toBe(1);
    expect(bad("const raw = msg.text; const a = () => `<p>${raw}</p>`;").length).toBe(1);
    expect(bad("const a = (rows) => `<ul>${rows.map((r) => `<li>${r.name}</li>`).join(\"\")}</ul>`;").length).toBe(1);
    expect(bad("const a = (m) => `<p class=\"${m.cls}\">${esc(m.text)}</p>`;").length).toBe(1);
    expect(bad("const a = (m) => \"<p>\" + m.text + \"</p>\";").length).toBe(1);
  });
  it("accepts the escapers, a safe local, a condition and a list of templates", () => {
    expect(bad("const a = (m) => `<p>${esc(m.text)}${numText(m.n)}${tr(\"k\")}</p>`;")).toEqual([]);
    expect(bad("const safe = esc(msg.text); const a = () => `<p>${safe}</p>`;")).toEqual([]);
    expect(bad("const a = (c) => `<p>${c.error ? esc(c.error) : \"\"}${c.ok && esc(c.name)}</p>`;")).toEqual([]);
    expect(bad("const a = (rows) => `<ul>${rows.map((r) => `<li>${esc(r.name)}</li>`).join(\"\")}</ul>`;")).toEqual([]);
  });
  it("mutation: removing esc() from a real screen is caught", () => {
    const cases: Array<[string, string, string]> = [
      ["views/inbox/thread.ts", "esc(msg.text)", "msg.text"],
      ["views/notes/index.ts", "esc(r.draftText)", "r.draftText"],
      ["views/orders/detail.ts", "esc(i.name)", "i.name"],
      ["kit/confirm-sheet.ts", "esc(i.customer)", "i.customer"],
    ];
    for (const [file, from, to] of cases) {
      const real = read(file);
      expect(real, `${file} no longer contains ${from}`).toContain(from);
      expect(contractViolations(file, real), file).toEqual([]);
      expect(contractViolations(file, real.replace(from, to)).length, `${file}: ${to}`).toBeGreaterThan(0);
    }
  });
});
