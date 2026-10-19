/**
 * Generated inputs of the hosted storefront page.
 *
 *   bun scripts/storefront-public-build.ts            write the generated files
 *   bun scripts/storefront-public-build.ts --check    exit 1 when they are stale
 *
 * The hosted page is rendered inside a Cloudflare Worker, which must not carry
 * the dashboard's 750 KB of translations or its 40 KB of CSS. This script
 * produces the two small files the Worker needs instead:
 *
 *   control-plane/storefront/web/messages.generated.json
 *       only the `storefront.*` messages the page code actually uses, resolved
 *       through the app's own static dictionaries and runtime dictionaries, so
 *       the page can never show different words from the Studio preview.
 *   control-plane/storefront/public/_sf/storefront.<hash>.css
 *       one Tailwind build of the shared storefront renderer, with the design
 *       tokens read from src/app/globals.css (never copied by hand).
 *   control-plane/storefront/web/asset-manifest.generated.json
 *       the hashed CSS path the Worker links to.
 *
 * Static assets are served by Cloudflare without invoking the Worker, so the
 * stylesheet costs nothing against the Workers Free request budget.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";

import { getTranslations } from "../src/lib/i18n";
import { getRuntimeTranslation } from "../src/lib/i18n/runtime-translations";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "control-plane/storefront/web");
const PUBLIC = join(ROOT, "control-plane/storefront/public");

const LOCALES = ["ar", "fr", "en"] as const;
const PLURAL_RULES = ["zero", "one", "two", "few", "many", "other"] as const;

/** The shared renderer files the hosted page draws, plus the page's own files. */
const RENDERER_FILES = [
  "src/components/storefront/storefront-renderer.tsx",
  "src/components/storefront/storefront-hero.tsx",
  "src/components/storefront/storefront-parts.tsx",
  "src/components/storefront/storefront-product-grid.tsx",
] as const;

function webSourceFiles(): string[] {
  const entries = readdirSync(WEB, { recursive: true }) as string[];
  return entries
    .filter((entry) => /\.(ts|tsx)$/.test(entry) && !/\.(test|generated)\./.test(entry))
    .map((entry) => join("control-plane/storefront/web", entry).split(sep).join("/"))
    .sort();
}

function scannedFiles(): string[] {
  return [...RENDERER_FILES, ...webSourceFiles()];
}

const KEY_PATTERN = /["'`](storefront\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)["'`]/g;

export function storefrontPublicMessageKeys(): string[] {
  const keys = new Set<string>();
  for (const file of scannedFiles()) {
    const source = readFileSync(join(ROOT, file), "utf8");
    for (const match of source.matchAll(KEY_PATTERN)) if (match[1]) keys.add(match[1]);
  }
  return [...keys].sort();
}

function resolveMessage(locale: (typeof LOCALES)[number], key: string): string | undefined {
  return getTranslations(locale)[key] ?? getRuntimeTranslation(locale, key) ?? undefined;
}

function buildMessages(): string {
  const out: Record<string, Record<string, string>> = { ar: {}, fr: {}, en: {} };
  for (const key of storefrontPublicMessageKeys()) {
    for (const locale of LOCALES) {
      const base = resolveMessage(locale, key);
      const target = out[locale] as Record<string, string>;
      if (base !== undefined) target[key] = base;
      for (const rule of PLURAL_RULES) {
        const plural = resolveMessage(locale, `${key}_${rule}`);
        if (plural !== undefined) target[`${key}_${rule}`] = plural;
      }
      // A key used by the page but missing from a language must fail the build,
      // never ship as a raw key on a customer's phone.
      if (base === undefined && !PLURAL_RULES.some((rule) => resolveMessage(locale, `${key}_${rule}`) !== undefined)) {
        throw new Error(`Storefront message "${key}" is missing for "${locale}"`);
      }
    }
  }
  const sorted: Record<string, Record<string, string>> = {};
  for (const locale of LOCALES) {
    const table = out[locale] as Record<string, string>;
    sorted[locale] = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/** The text of the first `opener { ... }` block, matching braces and skipping comments. */
function extractBlock(css: string, opener: string): string {
  const start = css.indexOf(`\n${opener}`);
  if (start < 0) throw new Error(`globals.css no longer has a "${opener}" block`);
  const from = start + 1;
  let depth = 0;
  for (let index = css.indexOf("{", from); index < css.length; index += 1) {
    if (css.startsWith("/*", index)) {
      index = css.indexOf("*/", index) + 1;
      continue;
    }
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(from, index + 1);
    }
  }
  throw new Error(`Unbalanced "${opener}" block in globals.css`);
}

function entryCss(): string {
  const globals = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
  const darkVariant = /^@custom-variant dark .*;$/m.exec(globals)?.[0];
  if (!darkVariant) throw new Error("globals.css no longer defines the dark custom variant");
  const system = readFileSync(join(ROOT, "src/app/storefront-system.css"), "utf8");
  const sources = scannedFiles()
    .map((file) => `@source "${relative(WEB, join(ROOT, file)).split(sep).join("/")}";`)
    .join("\n");
  return `@import "tailwindcss" source(none);
${sources}

${darkVariant}

${extractBlock(globals, "@theme inline {")}

${extractBlock(globals, "@theme {")}

/* Zero font bytes on a customer's phone: the system fonts already cover Arabic. */
@theme inline {
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Arabic", "Noto Sans", Tahoma, Arial, sans-serif;
}

${system}

:root { --radius: 0.625rem; }
html { -webkit-text-size-adjust: 100%; }
button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; }
[data-storefront-root] :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
[data-storefront-locale="ar"] {
  font-family: "Segoe UI", "Noto Sans Arabic", "Noto Naskh Arabic", Tahoma, system-ui, sans-serif;
  line-height: 1.65;
}
[data-storefront-locale="ar"] :where(:dir(rtl)) { letter-spacing: normal !important; }
.sf-notice {
  display: grid; min-height: 100svh; place-items: center; padding: 2rem; text-align: center;
  background: #fafaf9; color: #1c1917;
}
.sf-notice h1 { font-size: 1.25rem; font-weight: 600; }
.sf-notice p { margin-top: 0.5rem; color: #57534e; }
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}
`;
}

async function buildCss(): Promise<string> {
  const result = await postcss([tailwindcss({ optimize: { minify: true } })]).process(entryCss(), {
    from: join(WEB, "storefront.css"),
    map: false,
  });
  return result.css;
}

export type StorefrontPublicFiles = ReadonlyMap<string, string>;

/** Every generated file as repo-relative path -> content. Pure: writes nothing. */
export async function buildStorefrontPublic(): Promise<StorefrontPublicFiles> {
  const css = await buildCss();
  const hash = createHash("sha256").update(css).digest("hex").slice(0, 10);
  const cssPath = `/_sf/storefront.${hash}.css`;
  return new Map([
    ["control-plane/storefront/web/messages.generated.json", buildMessages()],
    ["control-plane/storefront/web/asset-manifest.generated.json", `${JSON.stringify({ css: cssPath }, null, 2)}\n`],
    [`control-plane/storefront/public${cssPath}`, css],
    [
      "control-plane/storefront/public/_headers",
      "/_sf/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n",
    ],
  ]);
}

function staleStylesheets(files: StorefrontPublicFiles): string[] {
  const directory = join(PUBLIC, "_sf");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .map((name) => `control-plane/storefront/public/_sf/${name}`)
    .filter((path) => !files.has(path));
}

/** What differs between the committed files and a fresh build. Empty means current. */
export function storefrontPublicDrift(files: StorefrontPublicFiles): string[] {
  const problems: string[] = [];
  for (const [path, content] of files) {
    const absolute = join(ROOT, path);
    if (!existsSync(absolute)) problems.push(`missing: ${path}`);
    else if (readFileSync(absolute, "utf8") !== content) problems.push(`stale: ${path}`);
  }
  for (const path of staleStylesheets(files)) problems.push(`obsolete: ${path}`);
  return problems;
}

export function writeStorefrontPublic(files: StorefrontPublicFiles): void {
  for (const [path, content] of files) {
    const absolute = join(ROOT, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  for (const path of staleStylesheets(files)) rmSync(join(ROOT, path));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = await buildStorefrontPublic();
  if (process.argv.includes("--check")) {
    const problems = storefrontPublicDrift(files);
    if (problems.length > 0) {
      console.error(`Storefront public files are out of date:\n${problems.join("\n")}\nRun: bun scripts/storefront-public-build.ts`);
      process.exit(1);
    }
    console.log("Storefront public files are current.");
  } else {
    writeStorefrontPublic(files);
    for (const [path, content] of files) console.log(`${path}  ${content.length} bytes`);
  }
}
