import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { storefrontPublicSourceFiles } from "../../../scripts/storefront-public-build";
import type { StorefrontI18n as Real } from "../../../src/components/storefront/storefront-locale-provider";
import type { StorefrontI18n as Shim } from "./shims/storefront-locale-provider";

// Compile-time: what the renderer reads from the real provider, the shim supplies.
type Assert<T extends true> = T;
export type ShimSatisfiesProvider = Assert<Shim extends Real ? true : false>;

const ROOT = process.cwd();
const PROVIDER = "@/components/storefront/storefront-locale-provider";
const SHIM_FILE = "control-plane/storefront/web/shims/storefront-locale-provider.tsx";

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8").replace(/\r\n?/g, "\n");
}

/** Runtime import specifiers of a file; `import type` statements carry no code. */
function runtimeImports(source: string): Array<{ names: string[]; from: string }> {
  const withoutTypes = source.replace(/import\s+type\s[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  const found: Array<{ names: string[]; from: string }> = [];
  for (const match of withoutTypes.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
    const clause = match[1] ?? "";
    const names = [...clause.matchAll(/[{,]\s*(?:type\s+)?([A-Za-z0-9_$]+)(?:\s+as\s+[A-Za-z0-9_$]+)?/g)].map((m) => m[1] ?? "");
    found.push({ names: names.filter(Boolean), from: match[2] ?? "" });
  }
  for (const match of withoutTypes.matchAll(/import\s+["']([^"']+)["']/g)) found.push({ names: [], from: match[1] ?? "" });
  return found;
}

const ALLOWED = [
  /^react$/,
  /^react-dom\/server$/,
  /^lucide-react$/,
  /^@\/lib\/utils$/,
  /^@\/components\/storefront\/(storefront-hero|storefront-parts|storefront-product-grid|storefront-renderer|storefront-locale-provider)$/,
  /^@\/components\/storefront\/studio\/studio-types$/,
  /^@\/lib\/storefront\/(presentation-types|studio-draft|studio-sections|storefront-tokens|theme-default)$/,
  /^@\/lib\/i18n\/render-translation$/,
  /^\.\/studio\/studio-types$/,
  /^\.\.?\/[A-Za-z0-9_./-]+$/,
];

describe("the page renders the shared storefront code, so its imports are policed", () => {
  const files = storefrontPublicSourceFiles().filter((file) => file !== SHIM_FILE);

  it("scans the shared renderer and every page source file", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "src/components/storefront/storefront-renderer.tsx",
        "src/components/storefront/storefront-hero.tsx",
        "src/components/storefront/storefront-parts.tsx",
        "src/components/storefront/storefront-product-grid.tsx",
        "control-plane/storefront/web/render-store-page.tsx",
      ]),
    );
  });

  it("imports nothing that would drag the dashboard (translations, router, Radix, UI kit) into the Worker", () => {
    const offenders: string[] = [];
    for (const file of storefrontPublicSourceFiles()) {
      for (const { from } of runtimeImports(read(file))) {
        if (!ALLOWED.some((pattern) => pattern.test(from))) offenders.push(`${file} -> ${from}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only asks the locale provider for names the Worker's version exports", () => {
    const shim = read(SHIM_FILE);
    const exported = new Set([...shim.matchAll(/export\s+(?:function|const|interface|type)\s+([A-Za-z0-9_$]+)/g)].map((m) => m[1]));
    const asked: string[] = [];
    for (const file of files) {
      for (const entry of runtimeImports(read(file))) {
        if (entry.from !== PROVIDER) continue;
        for (const name of entry.names) {
          asked.push(`${file}:${name}`);
          expect(exported.has(name), `${file} imports ${name} from the provider`).toBe(true);
        }
      }
    }
    expect(asked.length).toBeGreaterThanOrEqual(4);
  });

  it("is reached through the exact specifier the alias replaces", () => {
    const config = readFileSync(join(ROOT, "control-plane/storefront/wrangler.jsonc.example"), "utf8");
    expect(config).toContain(`"${PROVIDER}": "./web/shims/storefront-locale-provider.tsx"`);
    // A relative import of the same file would bypass the alias and pull the real one in.
    for (const file of files) {
      for (const entry of runtimeImports(read(file))) {
        if (/storefront-locale-provider$/.test(entry.from)) expect(entry.from, file).toBe(PROVIDER);
      }
    }
  });
});
