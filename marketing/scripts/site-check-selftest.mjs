#!/usr/bin/env node
// Proves the checks can fail: builds the site, breaks a copy in one way at a time and requires that
// scripts/site-check.mjs reports MORE problems for the matching check than on the untouched build.
// Usage: node marketing/scripts/site-check-selftest.mjs   (exit code 1 when a deliberate break goes unnoticed)
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { build } = await import(pathToFileURL(join(here, "..", "build.mjs")).href);
const pristine = mkdtempSync(join(tmpdir(), "sf-selftest-"));
build(pristine);

const edit = (dir, file, fn) => { const p = join(dir, file); const before = readFileSync(p, "utf8"); const after = fn(before); if (after === before) throw new Error(`mutation did not change ${file}`); writeFileSync(p, after); };
const MUTATIONS = [
  ["remove an alt", ["img-alt"], (d) => edit(d, "en/index.html", (h) => h.replace(/(<img[^>]*?)\salt="[^"]*"/, "$1"))],
  ["image without width/height", ["img-size"], (d) => edit(d, "en/pricing/index.html", (h) => h.replace("</main>", '<img src="/img/mark.svg" alt="x"></main>'))],
  ["duplicate h1", ["h1"], (d) => edit(d, "en/pricing/index.html", (h) => h.replace("</main>", "<h1>Second</h1></main>"))],
  ["skip a heading level", ["heading-order"], (d) => edit(d, "fr/pricing/index.html", (h) => h.replace("</main>", "<h5>Deep</h5></main>"))],
  ["external script tag", ["no-external"], (d) => edit(d, "en/index.html", (h) => h.replace("</head>", '<script src="https://cdn.example.com/x.js"></script></head>'))],
  ["external stylesheet in css", ["no-external"], (d) => edit(d, "assets/site.css", (c) => c + '\n@import url("https://fonts.googleapis.com/css2?family=Inter");')],
  ["external <a> not on the allowed list", ["outbound-list", "no-external"], (d) => edit(d, "en/index.html", (h) => h.replace("</main>", '<a href="https://tracker.example.org/x">t</a></main>'))],
  ["change a CSP hash", ["csp-inline-hashes"], (d) => edit(d, "_headers", (h) => h.replace(/'sha256-(.)/, (_m, c) => `'sha256-${c === "A" ? "B" : "A"}`))],
  ["add an inline script without hash", ["csp-inline-hashes"], (d) => edit(d, "en/help/index.html", (h) => h.replace("</body>", "<script>window.x=1</script></body>"))],
  ["inline event handler", ["csp-inline-hashes"], (d) => edit(d, "en/help/index.html", (h) => h.replace("<main", '<main onclick="x()"'))],
  ["unsafe-inline for scripts", ["csp-valid"], (d) => edit(d, "_headers", (h) => h.replace("script-src 'self'", "script-src 'unsafe-inline' 'self'"))],
  ["speculation rules edited", ["speculation-rules", "csp-inline-hashes"], (d) => edit(d, "en/index.html", (h) => h.replace('"eagerness":"moderate"', '"eagerness":"eager"'))],
  ["fonts not cached long", ["cache-headers"], (d) => edit(d, "_headers", (h) => h.replace(/\/fonts\/\*\n\s+Cache-Control:[^\n]*/, "/fonts/*\n  Cache-Control: public, max-age=0, must-revalidate"))],
  ["font-display block", ["fonts"], (d) => edit(d, "assets/site.css", (c) => c.replace("font-display:swap", "font-display:block"))],
  ["COOP removed", ["security-headers"], (d) => edit(d, "_headers", (h) => h.replace(/\s+Cross-Origin-Opener-Policy:[^\n]*/, ""))],
  ["duplicate title", ["title-unique"], (d) => edit(d, "en/help/index.html", (h) => h.replace(/<title>[^<]*<\/title>/, "<title>Pricing — SahelFlow</title>"))],
  ["short meta description", ["description"], (d) => edit(d, "en/security/index.html", (h) => h.replace(/(<meta name="description" content=")[^"]*/, "$1Too short"))],
  ["ar page with dir=ltr", ["lang-dir"], (d) => edit(d, "ar/index.html", (h) => h.replace('dir="rtl"', 'dir="ltr"'))],
  ["canonical points elsewhere", ["canonical"], (d) => edit(d, "en/pricing/index.html", (h) => h.replace(/(rel="canonical" href=")[^"]*/, "$1https://sahelflow.com/en/"))],
  ["hreflang fr removed", ["hreflang"], (d) => edit(d, "en/pricing/index.html", (h) => h.replace(/<link rel="alternate" hreflang="fr"[^>]*>\n?/, ""))],
  ["og:image missing", ["open-graph"], (d) => edit(d, "en/pricing/index.html", (h) => h.replace(/<meta property="og:image" [^>]*>\n?/, ""))],
  ["og:image file deleted", ["open-graph"], (d) => unlinkSync(join(d, "img", "og-fr.png"))],
  ["JSON-LD broken", ["jsonld"], (d) => edit(d, "en/index.html", (h) => h.replace('{"@context"', '{"@context" ,,'))],
  ["FAQPage without a visible FAQ", ["jsonld"], (d) => edit(d, "en/contact/index.html", (h) => h.replace("</head>", '<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Invisible question?","acceptedAnswer":{"@type":"Answer","text":"Invisible answer text that is nowhere on the page."}}]}</script></head>'))],
  ["404 loses noindex", ["noindex-404"], (d) => edit(d, "404.html", (h) => h.replace(/<meta name="robots"[^>]*>\n?/, ""))],
  ["sitemap entry removed", ["sitemap"], (d) => edit(d, "sitemap.xml", (x) => x.replace(/<url>.*?<\/url>\n/, ""))],
  ["sitemap lists a missing page", ["sitemap"], (d) => edit(d, "sitemap.xml", (x) => x.replace("</urlset>", '<url><loc>https://sahelflow.com/en/ghost/</loc></url></urlset>'))],
  ["robots without sitemap", ["robots"], (d) => edit(d, "robots.txt", (t) => t.replace(/Sitemap:.*\n?/, ""))],
  ["broken internal link", ["internal-links"], (d) => edit(d, "en/index.html", (h) => h.replace(/href="\/en\/pricing\/"/, 'href="/en/prices/"'))],
  ["redirect to a missing page", ["redirects"], (d) => edit(d, "_redirects", (t) => t + "\n/old /en/gone/ 301\n")],
  ["second skip link", ["skip-link"], (d) => edit(d, "en/index.html", (h) => h.replace("<header", '<a class="skip-link" href="#main">again</a><header'))],
  ["no footer", ["landmarks"], (d) => edit(d, "en/index.html", (h) => h.replace(/<footer[\s\S]*<\/footer>/, ""))],
  ["button without a name", ["controls"], (d) => edit(d, "en/index.html", (h) => h.replace("</main>", "<button></button></main>"))],
  ["woff2 replaced by ttf", ["fonts"], (d) => edit(d, "assets/site.css", (c) => c.replace(/\.woff2\?v=\w+/, ".ttf"))],
  ["css over budget", ["budget"], (d) => edit(d, "assets/site.css", (c) => c + "\n" + Array.from({ length: 60000 }, (_, i) => `.x${i}{color:#${(i * 2654435761 % 16777216).toString(16).padStart(6, "0")};margin:${i % 97}px}`).join("\n"))],
];

const run = (dir) => {
  const r = spawnSync(process.execPath, [join(here, "site-check.mjs"), dir, "--all"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const counts = {};
  for (const m of r.stdout.matchAll(/^(PASS|FAIL)\s+(\S+)\s+(?:(\d+) problems?, )?/gm)) counts[m[2]] = m[1] === "FAIL" ? Number(m[3]) : 0;
  return counts;
};
const base = run(pristine);
let missed = 0;
console.log(`untouched build: ${Object.values(base).filter((n) => n > 0).length} of ${Object.keys(base).length} checks already fail (${Object.entries(base).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`).join(", ") || "none"})\n`);
for (const [name, ids, apply] of MUTATIONS) {
  const copy = mkdtempSync(join(tmpdir(), "sf-selftest-copy-"));
  cpSync(pristine, copy, { recursive: true });
  try { apply(copy); } catch (e) { console.log(`ERROR ${name}: ${e.message}`); missed++; rmSync(copy, { recursive: true, force: true }); continue; }
  const now = run(copy);
  const caught = ids.filter((id) => (now[id] ?? 0) > (base[id] ?? 0));
  if (!caught.length) missed++;
  console.log(`${caught.length ? "CAUGHT" : "MISSED"}  ${name.padEnd(38)} expected ${ids.join("/")}${caught.length ? ` → ${caught.map((id) => `${id} ${base[id] ?? 0}→${now[id]}`).join(", ")}` : ` → not reported (${ids.map((id) => `${id} ${base[id] ?? 0}→${now[id] ?? "?"}`).join(", ")})`}`);
  rmSync(copy, { recursive: true, force: true });
}
rmSync(pristine, { recursive: true, force: true });
console.log(`\n${MUTATIONS.length - missed} of ${MUTATIONS.length} deliberate breaks were caught`);
process.exit(missed ? 1 : 0);
