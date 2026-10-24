/**
 * Generated inputs of the hosted storefront page.
 *
 *   bun scripts/storefront-public-build.ts            write the generated files
 *   bun scripts/storefront-public-build.ts --check    exit 1 when they are stale
 *
 * Produces everything the storefront Worker serves or embeds besides its own code:
 *
 *   control-plane/storefront/web/messages.generated.json
 *       only the `storefront.*` messages the page code asks for, resolved through the
 *       app's own static and runtime dictionaries, so the public page can never use
 *       different words from the Studio.
 *   control-plane/storefront/public/_sf/shop.<hash>.css   the store stylesheet
 *   control-plane/storefront/public/_sf/shop.<hash>.js    the order-form script
 *   control-plane/storefront/public/_sf/c.<hash>/<wilaya>.json   communes, one file per wilaya
 *   control-plane/storefront/web/asset-manifest.generated.json   the hashed paths
 *
 * Files under public/ are served by Cloudflare without running the Worker, so they cost
 * nothing against the Workers Free request budget and are cached for a year (hashed names).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build, transform } from "esbuild";

import { getTranslations } from "../src/lib/i18n";
import { getRuntimeTranslation } from "../src/lib/i18n/runtime-translations";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "control-plane/storefront/web");
const PUBLIC = join(ROOT, "control-plane/storefront/public");
const REL_PUBLIC = "control-plane/storefront/public";

const LOCALES = ["ar", "fr", "en"] as const;
const PLURAL_RULES = ["zero", "one", "two", "few", "many", "other"] as const;

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return (readdirSync(directory, { recursive: true }) as string[])
    .map((entry) => join(directory, entry))
    .filter((path) => statSync(path).isFile());
}

/** Repo-relative paths of every source file the hosted page is built from. */
export function storefrontPublicSourceFiles(): string[] {
  return walk(WEB)
    .map((path) => path.slice(ROOT.length + 1).split(sep).join("/"))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.(test|generated)\.|(^|\/)test-support\./.test(file))
    .sort();
}

const KEY_PATTERN = /["'`](storefront\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)["'`]/g;

export function storefrontPublicMessageKeys(): string[] {
  const keys = new Set<string>();
  for (const file of storefrontPublicSourceFiles()) {
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
      let plural = false;
      for (const rule of PLURAL_RULES) {
        const value = resolveMessage(locale, `${key}_${rule}`);
        if (value !== undefined) {
          target[`${key}_${rule}`] = value;
          plural = true;
        }
      }
      // A key the page uses but a language lacks must fail the build, never ship as a raw key on a phone.
      if (base === undefined && !plural) throw new Error(`Storefront message "${key}" is missing for "${locale}"`);
    }
  }
  const sorted: Record<string, Record<string, string>> = {};
  for (const locale of LOCALES) {
    const table = out[locale] as Record<string, string>;
    sorted[locale] = Object.fromEntries(Object.entries(table).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

/** The newer templates. Each has styles/<id>.css (its @font-face rules and skin) and, for reel, client/reel.ts. */
const SKINS = ["prime", "souk", "reel", "noir", "lumen", "atelier", "pulse", "bloom"] as const;

/**
 * Every subsetted face under web/fonts, in any sub-folder (SIL OFL, one licence file per family next to the fonts),
 * hashed so it can be cached for a year. The file name without .woff2 is the key a stylesheet names as __SF_FONT_<key>__,
 * so a name used twice is an error, not a silent overwrite.
 */
function buildFonts(): { paths: Record<string, string>; files: Map<string, Buffer> } {
  const paths: Record<string, string> = {};
  const files = new Map<string, Buffer>();
  for (const file of walk(join(WEB, "fonts")).filter((path) => path.endsWith(".woff2")).sort()) {
    const name = file.slice(file.lastIndexOf(sep) + 1, -".woff2".length);
    if (paths[name]) throw new Error(`two font files are named ${name}.woff2`);
    const data = readFileSync(file);
    const path = `/_sf/f.${createHash("sha256").update(data).digest("hex").slice(0, 10)}.${name}.woff2`;
    paths[name] = path;
    files.set(`${REL_PUBLIC}${path}`, data);
  }
  return { paths, files };
}

async function buildCss(fontPaths: Record<string, string>, file = "styles/shop.css"): Promise<string> {
  const source = readFileSync(join(WEB, file), "utf8").replace(/__SF_FONT_([a-z0-9-]+)__/g, (_match, name: string) => {
    const path = fontPaths[name];
    if (!path) throw new Error(`stylesheet names an unknown font: ${name}`);
    return path;
  });
  const result = await transform(source, {
    loader: "css",
    minify: true,
    target: ["chrome80", "safari13", "firefox78"],
    legalComments: "none",
  });
  return result.code;
}

async function buildScript(entry = "client/shop.ts"): Promise<string> {
  const result = await build({
    entryPoints: [join(WEB, entry)],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2019",
    minify: true,
    legalComments: "none",
    tsconfig: join(ROOT, "tsconfig.json"),
    absWorkingDir: ROOT,
    logLevel: "silent",
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error(`${entry} produced no output`);
  return output.text;
}

type Commune = { wilayaCode: number; name: string; nameAr: string };

function buildCommunes(): { hash: string; files: Map<string, string> } {
  const all = JSON.parse(readFileSync(join(ROOT, "data/communes.json"), "utf8")) as Commune[];
  const byWilaya = new Map<string, Array<[string, string]>>();
  for (const commune of all) {
    const code = String(commune.wilayaCode).padStart(2, "0");
    const list = byWilaya.get(code) ?? [];
    list.push([commune.name, commune.nameAr]);
    byWilaya.set(code, list);
  }
  const serialised = new Map<string, string>();
  for (const [code, list] of [...byWilaya.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    list.sort((a, b) => a[0].localeCompare(b[0], "fr"));
    serialised.set(code, JSON.stringify(list));
  }
  // One index of every commune for the checkout's search box: [latin, arabic, wilayaCode], French alphabetical, then wilaya code, so
  // namesakes sit side by side. The code is the same two-digit string as the file names, so the page needs no conversion.
  const index: Array<[string, string, string]> = [];
  for (const [code, json] of serialised) for (const [latin, arabic] of JSON.parse(json) as Array<[string, string]>) index.push([latin, arabic, code]);
  index.sort((a, b) => a[0].localeCompare(b[0], "fr") || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
  serialised.set("all", JSON.stringify(index));
  // The folder name is the hash of every file in it (the index too), so a change to any list gives the page a new, never-cached address.
  const hash = createHash("sha256").update([...serialised.entries()].map(([code, json]) => `${code}${json}`).join("\n")).digest("hex").slice(0, 10);
  const files = new Map<string, string>();
  for (const [code, json] of serialised) files.set(`${REL_PUBLIC}/_sf/c.${hash}/${code}.json`, json);
  return { hash, files };
}

export type StorefrontPublicFiles = ReadonlyMap<string, string | Buffer>;

const short = (content: string) => createHash("sha256").update(content).digest("hex").slice(0, 10);

/** Every generated file as repo-relative path -> content. Pure: writes nothing. */
export async function buildStorefrontPublic(): Promise<StorefrontPublicFiles> {
  const fonts = buildFonts();
  const [css, js] = await Promise.all([buildCss(fonts.paths), buildScript()]);
  const communes = buildCommunes();
  const cssPath = `/_sf/shop.${short(css)}.css`;
  const jsPath = `/_sf/shop.${short(js)}.js`;
  const skinFiles = new Map<string, string>();
  const skins: Record<string, { css: string; js?: string }> = {};
  for (const id of SKINS) {
    const skinCss = await buildCss(fonts.paths, `styles/${id}.css`);
    skins[id] = { css: `/_sf/${id}.${short(skinCss)}.css` };
    skinFiles.set(`${REL_PUBLIC}${skins[id].css}`, skinCss);
    if (existsSync(join(WEB, `client/${id}.ts`))) {
      const skinJs = await buildScript(`client/${id}.ts`);
      skins[id].js = `/_sf/${id}.${short(skinJs)}.js`;
      skinFiles.set(`${REL_PUBLIC}${skins[id].js}`, skinJs);
    }
  }
  const files = new Map<string, string | Buffer>([
    ["control-plane/storefront/web/messages.generated.json", buildMessages()],
    [
      "control-plane/storefront/web/asset-manifest.generated.json",
      `${JSON.stringify({ css: cssPath, js: jsPath, communes: `/_sf/c.${communes.hash}`, fonts: fonts.paths, skins }, null, 2)}\n`,
    ],
    [`${REL_PUBLIC}${cssPath}`, css],
    [`${REL_PUBLIC}${jsPath}`, js],
    [
      `${REL_PUBLIC}/_headers`,
      "/_sf/*\n  Cache-Control: public, max-age=31536000, immutable\n  X-Content-Type-Options: nosniff\n",
    ],
  ]);
  for (const [path, content] of skinFiles) files.set(path, content);
  for (const [path, content] of communes.files) files.set(path, content);
  for (const [path, content] of fonts.files) files.set(path, content);
  return files;
}

function obsolete(files: StorefrontPublicFiles): string[] {
  return walk(join(PUBLIC, "_sf"))
    .map((path) => path.slice(ROOT.length + 1).split(sep).join("/"))
    .filter((path) => !files.has(path));
}

/** What differs between the committed files and a fresh build. Empty means current. */
export function storefrontPublicDrift(files: StorefrontPublicFiles): string[] {
  const problems: string[] = [];
  for (const [path, content] of files) {
    const absolute = join(ROOT, path);
    if (!existsSync(absolute)) problems.push(`missing: ${path}`);
    else if (!readFileSync(absolute).equals(typeof content === "string" ? Buffer.from(content) : content)) problems.push(`stale: ${path}`);
  }
  for (const path of obsolete(files)) problems.push(`obsolete: ${path}`);
  return problems;
}

export function writeStorefrontPublic(files: StorefrontPublicFiles): void {
  for (const path of obsolete(files)) rmSync(join(ROOT, path));
  for (const [path, content] of files) {
    const absolute = join(ROOT, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
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
    const big = [...files].filter(([path]) => !path.includes("/c."));
    for (const [path, content] of big) console.log(`${path}  ${typeof content === "string" ? Buffer.byteLength(content) : content.length} bytes`);
    console.log(`communes: ${files.size - big.length} files`);
  }
}
