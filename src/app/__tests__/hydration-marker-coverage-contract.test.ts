import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R50 hydr, item 2. The marker `html[data-sf-hydrated]` is how the browser checks (e2e, the UI sweep) know a page is
 * interactive. Every page a person can LAND on has to set it, or the checks report a hydrated page as "not hydrated"
 * (sweep run1: 32 false alarms on the 404 page and the public store pages). This contract walks src/app and fails for
 * any new page whose route chain (the page itself or a layout above it) does not mount `RuntimeUiReadyBeacon`
 * (app shell, sign-in) or `HydrationMarker` (public pages).
 */
const APP = path.resolve(__dirname, "..");
const MARKERS = ["RuntimeUiReadyBeacon", "HydrationMarker"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "__tests__" || name === "api") return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const read = (file: string) => readFileSync(file, "utf8");
const mountsMarker = (file: string) => {
  const text = read(file);
  return MARKERS.some((name) => new RegExp(`<${name}\\b`).test(text));
};

/** The page file plus every layout.tsx from its folder up to src/app. */
function chain(file: string): string[] {
  const files = [file];
  let dir = path.dirname(file);
  for (;;) {
    const layout = path.join(dir, "layout.tsx");
    try {
      statSync(layout);
      files.push(layout);
    } catch {
      /* no layout in this folder */
    }
    if (dir === APP) break;
    dir = path.dirname(dir);
  }
  return files;
}

/** A page that only redirects never paints, so it has nothing to hydrate. */
const redirectOnly = (file: string) => /\bredirect\(/.test(read(file)) && !/return\s*\(?\s*</.test(read(file));

describe("the hydration marker covers every page a person can land on", () => {
  const files = walk(APP);
  const pages = files.filter((f) => /[\\/]page\.tsx$/.test(f));
  const notFounds = files.filter((f) => /[\\/]not-found\.tsx$/.test(f));

  it("finds the pages (guard against a broken walk)", () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(pages.some((f) => f.includes(`${path.sep}storefront${path.sep}`))).toBe(true);
  });

  it.each(pages.map((f) => [path.relative(APP, f), f]))("%s sets the marker (itself or a layout above it)", (_name, file) => {
    if (redirectOnly(file)) return;
    const chainFiles = chain(file);
    expect(
      chainFiles.some(mountsMarker),
      `none of ${chainFiles.map((f) => path.relative(APP, f)).join(", ")} mounts ${MARKERS.join(" or ")}`,
    ).toBe(true);
  });

  it.each(notFounds.map((f) => [path.relative(APP, f), f]))("%s sets the marker (itself or a layout above it)", (_name, file) => {
    const chainFiles = chain(file);
    expect(
      chainFiles.some(mountsMarker),
      `none of ${chainFiles.map((f) => path.relative(APP, f)).join(", ")} mounts ${MARKERS.join(" or ")}`,
    ).toBe(true);
  });
});
