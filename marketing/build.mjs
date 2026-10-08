#!/usr/bin/env node
// Builds sahelflow.com into marketing/dist as plain static files.
// Usage: node marketing/build.mjs   (or: bun run marketing:build)
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  const styles = join(root, "src", "styles");
  write("assets/site.css", readdirSync(styles).filter((f) => f.endsWith(".css")).sort().map((f) => readFileSync(join(styles, f), "utf8")).join("\n"));
  cpSync(join(root, "src", "site.js"), join(dist, "assets", "site.js"));
  cpSync(join(root, "src", "gl.js"), join(dist, "assets", "gl.js"));

  const urls = [];
  for (const locale of SITE.locales) {
    for (const [id, path] of sitePages()) {
      write(`${locale}/${path ? `${path}/` : ""}index.html`, render(locale, id));
      urls.push(path);
    }
  }
  write("index.html", rootRedirect());
  write("404.html", notFoundPage());

  const today = new Date().toISOString().slice(0, 10);
  const unique = [...new Set(urls)];
  const entries = SITE.locales.flatMap((locale) =>
    unique.map((path) => {
      const rest = path ? `${path}/` : "";
      const alts = SITE.locales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE.origin}/${l}/${rest}"/>`)
        .join("");
      return `<url><loc>${SITE.origin}/${locale}/${rest}</loc><lastmod>${today}</lastmod>${alts}</url>`;
    }),
  );
  write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join("\n")}\n</urlset>\n`,
  );
  write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE.origin}/sitemap.xml\n`);
  return { dist, pages: entries.length, modules: MODULES.length, solutions: SOLUTIONS.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = build();
  console.log(`sahelflow.com built: ${result.pages} pages → ${result.dist}`);
}
