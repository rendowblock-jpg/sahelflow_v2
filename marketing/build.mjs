#!/usr/bin/env node
// Builds sahelflow.com into marketing/dist as plain static files.
// Usage: node marketing/build.mjs   (or: bun run marketing:build)
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SITE } from "./src/config.mjs";
import { MODULES, SOLUTIONS, sitePages } from "./src/model.mjs";
import {
  contactPage,
  downloadPage,
  helpPage,
  homePage,
  integrationsPage,
  legalPage,
  modulePage,
  notFoundPage,
  pricingPage,
  productPage,
  rootRedirect,
  securityPage,
  solutionPage,
  whyPage,
} from "./src/pages.mjs";

const root = dirname(fileURLToPath(import.meta.url));
let dist = join(root, "dist");

function write(path, content) {
  const file = join(dist, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}


/** Short content hash of a file or string; the URL changes exactly when the content does. */
const fingerprint = (data) => createHash("sha256").update(data).digest("hex").slice(0, 10);
const walkFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(join(dir, e.name)) : [join(dir, e.name)]));
const ASSET_REF = /(\/(?:img|fonts|assets)\/[\w./-]+?\.(?:webp|png|jpg|avif|svg|woff2|css|js))(\?v=\w+)?(?![\w/])/g;

/** Inline scripts that run (and speculation rules) must be allowed by hash in the CSP; JSON-LD is data and needs none. */
export function inlineScriptHashes(html) {
  const out = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1] ?? "";
    if (/\ssrc=/.test(attrs)) continue;
    const type = /\stype="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (type !== "" && type !== "module" && type !== "text/javascript" && type !== "speculationrules") continue;
    out.push(createHash("sha256").update(m[2] ?? "").digest("base64"));
  }
  return out;
}

/** Put exactly these sha256 hashes into the script-src of a `_headers` text (keywords such as 'self' stay). */
export function withScriptHashes(headers, hashes) {
  return headers.replace(/(Content-Security-Policy:[^\n]*?script-src )([^;\n]*)/, (_m, head, list) => {
    const keep = list.split(/\s+/).filter((t) => t && !/^'sha256-/.test(t));
    keep.splice(keep.indexOf("'self'") + 1, 0, ...[...new Set(hashes)].sort().map((h) => `'sha256-${h}'`));
    return head + keep.join(" ");
  });
}

/** Every page id → its renderer. */
function render(locale, id) {
  if (id.startsWith("module:")) return modulePage(locale, id.slice(7));
  if (id.startsWith("solution:")) return solutionPage(locale, id.slice(9));
  switch (id) {
    case "home": return homePage(locale);
    case "product": return productPage(locale);
    case "integrations": return integrationsPage(locale);
    case "pricing": return pricingPage(locale);
    case "why": return whyPage(locale);
    case "security": return securityPage(locale);
    case "download": return downloadPage(locale);
    case "help": return helpPage(locale);
    case "contact": return contactPage(locale);
    case "privacy":
    case "terms": return legalPage(locale, id);
    default: throw new Error(`No renderer for page ${id}`);
  }
}

/** Build the whole site into `outDir` (marketing/dist by default). */
export function build(outDir = join(root, "dist")) {
  dist = outDir;
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(join(dist, "assets"), { recursive: true });
  cpSync(join(root, "static"), dist, { recursive: true });
  // The 1600 px originals only feed marketing/scripts/make-screens.mjs; pages use the 480/800/1200 copies.
  for (const f of readdirSync(join(dist, "img", "screens"))) if (/^[a-z]+-(ar|fr|en)\.webp$/.test(f)) rmSync(join(dist, "img", "screens", f));

  // Fingerprints: every font, image, stylesheet and script is referenced as /path?v=<content hash>, so the
  // Cloudflare rules in _headers can cache them for a year (immutable) and a changed file gets a new URL.
  const fp = new Map();
  for (const file of walkFiles(join(dist)).filter((f) => /\/(img|fonts)\//.test(f) && /\.(webp|png|jpg|avif|svg|woff2)$/.test(f)))
    fp.set(file.slice(dist.length).replace(/\\/g, "/"), fingerprint(readFileSync(file)));
  const stamp = (text) => text.replace(ASSET_REF, (m, path) => (fp.has(path) ? `${path}?v=${fp.get(path)}` : m));
  const styles = join(root, "src", "styles");
  write("assets/site.css", stamp(readdirSync(styles).filter((f) => f.endsWith(".css")).sort().map((f) => readFileSync(join(styles, f), "utf8")).join("\n")));
  cpSync(join(root, "src", "site.js"), join(dist, "assets", "site.js"));
  fp.set("/assets/site.css", fingerprint(readFileSync(join(dist, "assets", "site.css"))));
  fp.set("/assets/site.js", fingerprint(readFileSync(join(dist, "assets", "site.js"))));

  const hashes = new Set();
  const writePage = (path, html) => {
    const out = stamp(html);
    for (const h of inlineScriptHashes(out)) hashes.add(h);
    write(path, out);
  };
  const urls = [];
  for (const locale of SITE.locales) {
    for (const [id, path] of sitePages()) {
      writePage(`${locale}/${path ? `${path}/` : ""}index.html`, render(locale, id));
      urls.push(path);
    }
  }
  writePage("index.html", rootRedirect());
  writePage("404.html", notFoundPage());

  const unique = [...new Set(urls)];
  const entries = SITE.locales.flatMap((locale) =>
    unique.map((path) => {
      const rest = path ? `${path}/` : "";
      const alt = (l, h = l) => `<xhtml:link rel="alternate" hreflang="${h}" href="${SITE.origin}/${l}/${rest}"/>`;
      const alts = [...SITE.locales.map((l) => alt(l)), alt(SITE.defaultLocale, "x-default")].join("");
      // No <lastmod>: a date that changes on every build tells crawlers nothing true.
      return `<url><loc>${SITE.origin}/${locale}/${rest}</loc>${alts}</url>`;
    }),
  );
  write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`,
  );
  write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /get/\nSitemap: ${SITE.origin}/sitemap.xml\n`);
  if (SITE.securityEmail) {
    const expires = new Date(Date.now() + 300 * 864e5).toISOString().replace(/\.\d+Z$/, "Z");
    write(".well-known/security.txt", `Contact: mailto:${SITE.securityEmail}\nExpires: ${expires}\nPreferred-Languages: en, fr, ar\nCanonical: ${SITE.origin}/.well-known/security.txt\n`);
  }
  // The CSP lists the sha256 of every inline script the pages carry: computed here, so it cannot go stale in dist.
  const headers = withScriptHashes(readFileSync(join(root, "static", "_headers"), "utf8"), hashes);
  write("_headers", headers);
  return { dist, pages: entries.length, modules: MODULES.length, solutions: SOLUTIONS.length, hashes: [...hashes], headers };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = build();
  if (process.argv.includes("--sync-headers")) {
    writeFileSync(join(root, "static", "_headers"), result.headers);
    console.log(`static/_headers: script-src now lists ${result.hashes.length} inline script hash(es)`);
  }
  console.log(`sahelflow.com built: ${result.pages} pages → ${result.dist}`);
}
