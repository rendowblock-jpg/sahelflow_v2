import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildStorefrontPublic,
  storefrontPublicDrift,
  storefrontPublicMessageKeys,
} from "../../../scripts/storefront-public-build";
import manifest from "./asset-manifest.generated.json";

const ROOT = process.cwd();
const MESSAGES = "control-plane/storefront/web/messages.generated.json";

describe("generated page files", () => {
  it("are current: a change to the renderer, its words or the design tokens needs `bun scripts/storefront-public-build.ts`", async () => {
    const files = await buildStorefrontPublic();
    expect(storefrontPublicDrift(files)).toEqual([]);
  }, 60_000);

  it("notice a stale words file and a missing stylesheet", async () => {
    const files = new Map(await buildStorefrontPublic());
    files.set(MESSAGES, "{}\n");
    files.set("control-plane/storefront/public/_sf/storefront.0000000000.css", "x");
    const problems = storefrontPublicDrift(files);
    expect(problems).toContain(`stale: ${MESSAGES}`);
    expect(problems).toContain("missing: control-plane/storefront/public/_sf/storefront.0000000000.css");
  }, 60_000);

  it("name a stylesheet that is no longer produced", async () => {
    const files = new Map(await buildStorefrontPublic());
    files.delete(`control-plane/storefront/public${manifest.css}`);
    expect(storefrontPublicDrift(files)).toContain(`obsolete: control-plane/storefront/public${manifest.css}`);
  }, 60_000);

  it("link a hashed stylesheet that exists and is cached for a year", () => {
    expect(manifest.css).toMatch(/^\/_sf\/storefront\.[0-9a-f]{10}\.css$/);
    expect(existsSync(join(ROOT, "control-plane/storefront/public", manifest.css))).toBe(true);
    const headers = readFileSync(join(ROOT, "control-plane/storefront/public/_headers"), "utf8");
    expect(headers).toContain("/_sf/*");
    expect(headers).toContain("max-age=31536000, immutable");
  });

  it("scan the words the page code asks for and leave none missing in any language", () => {
    const keys = storefrontPublicMessageKeys();
    for (const key of ["storefront.public.notFoundTitle", "storefront.view.outOfStock", "storefront.language.label"]) {
      expect(keys).toContain(key);
    }
    const tables = JSON.parse(readFileSync(join(ROOT, MESSAGES), "utf8")) as Record<string, Record<string, string>>;
    for (const locale of ["ar", "fr", "en"]) {
      const table = tables[locale] ?? {};
      for (const key of keys) {
        const present = key in table || Object.keys(table).some((entry) => entry.startsWith(`${key}_`));
        expect(present, `${locale} ${key}`).toBe(true);
      }
    }
  });

  it("produce a small stylesheet that carries what the renderer needs and none of the dashboard", () => {
    const css = readFileSync(join(ROOT, "control-plane/storefront/public", manifest.css), "utf8");
    expect(css.length).toBeLessThan(40_000);
    for (const needle of [
      "rounded-storefront-soft", "grid-cols-2", "@container", "bg-card", "text-muted-foreground",
      "line-clamp-2", ":dir(rtl)", "data-storefront-root", "prefers-reduced-motion", ".sf-notice",
    ]) {
      expect(css, needle).toContain(needle);
    }
    expect(css).not.toContain("sidebar");
    expect(css).not.toContain("font-inter");
  });
});
