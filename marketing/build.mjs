#!/usr/bin/env node
// Builds sahelflow.com into marketing/dist as plain static files.
// Usage: node marketing/build.mjs   (or: bun run marketing:build)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SITE } from "./src/config.mjs";
import { downloadPage, homePage, legalPage, notFoundPage, rootRedirect } from "./src/templates.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const screensDir = join(root, "static", "img", "screens");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "assets"), { recursive: true });
cpSync(join(root, "static"), dist, { recursive: true });
cpSync(join(root, "src", "site.css"), join(dist, "assets", "site.css"));
cpSync(join(root, "src", "site.js"), join(dist, "assets", "site.js"));

const available = existsSync(screensDir) ? new Set(readdirSync(screensDir)) : new Set();
/** Locale screenshot when captured, else the French one, else any. */
function shotsFor(locale) {
  return (key) => {
    for (const candidate of [`${key}-${locale}.webp`, `${key}-fr.webp`, `${key}-en.webp`, `${key}-ar.webp`]) {
      if (available.has(candidate)) return `/img/screens/${candidate}`;
    }
    return `/img/screens/dashboard-${locale}.webp`;
  };
}

function write(path, html) {
  const file = join(dist, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const pages = [];
for (const locale of SITE.locales) {
  write(`${locale}/index.html`, homePage(locale, shotsFor(locale)));
  write(`${locale}/download/index.html`, downloadPage(locale));
  write(`${locale}/privacy/index.html`, legalPage(locale, "privacy"));
  write(`${locale}/terms/index.html`, legalPage(locale, "terms"));
  pages.push(`${locale}/`, `${locale}/download/`, `${locale}/privacy/`, `${locale}/terms/`);
}
write("index.html", rootRedirect());
write("404.html", notFoundPage());

const today = new Date().toISOString().slice(0, 10);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${pages
    .map((p) => {
      const rest = p.slice(3);
      const alts = SITE.locales
        .map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE.origin}/${l}/${rest}"/>`)
        .join("");
      return `<url><loc>${SITE.origin}/${p}</loc><lastmod>${today}</lastmod>${alts}</url>`;
    })
    .join("\n")}\n</urlset>\n`,
);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE.origin}/sitemap.xml\n`);

console.log(`sahelflow.com built: ${pages.length + 2} pages → ${dist}`);
