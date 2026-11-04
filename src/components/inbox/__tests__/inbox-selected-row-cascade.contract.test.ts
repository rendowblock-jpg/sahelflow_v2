import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The lane's module CSS says the selected conversation row has "no wash, no
 * thick bar" (a 3 px marker + one surface step). A MODULE rule has specificity
 * (0,2,0); `src/app/workspace-system.css` had its own rule on
 * `[data-inbox-workspace="v2"] [data-inbox-conversation][aria-current="true"]`
 * (0,3,0, RTL 0,4,1) that painted a primary-tinted gradient AND an inset ring,
 * so in Chromium the wash was still there (MEASURED on Modal, merged tree
 * 53aeb9d7, ar light + dark: backgroundImage = linear-gradient(270deg, primary
 * 11% ...), boxShadow = inset 1px). The lane's tests read only the module file,
 * so they could not see it. This test reads the OTHER file.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

function rulesFor(source: string, needle: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (m[1]!.includes(needle)) out.push({ selector: m[1]!.trim(), body: m[2]! });
  }
  return out;
}

describe("no global stylesheet repaints the selected inbox row", () => {
  const files = ["src/app/workspace-system.css", "src/app/globals.css", "src/app/responsive-system.css", "src/app/motion-system.css"];

  for (const file of files) {
    it(`${file}: no gradient and no inset ring on [data-inbox-conversation][aria-current="true"]`, () => {
      const rules = rulesFor(read(file), '[data-inbox-conversation][aria-current="true"]');
      for (const r of rules) {
        // the motion system may list the row in a transition-property group; a PAINT is a gradient, a colour mix background or a shadow
        expect(r.body, `${file}: ${r.selector}`).not.toMatch(/gradient/);
        expect(r.body, `${file}: ${r.selector}`).not.toMatch(/box-shadow/);
        expect(r.body, `${file}: ${r.selector}`).not.toMatch(/background(-color)?\s*:/);
      }
    });
  }

  it("the module rule is the only owner of the selected look (marker + one surface step)", () => {
    const module = read("src/components/inbox/inbox-v3-workspace.module.css");
    expect(module).toContain('.row[aria-current="true"]::before');
    expect(module).toMatch(/\.row\[aria-current="true"\] \{\s*background: var\(--background\);/);
  });
});
