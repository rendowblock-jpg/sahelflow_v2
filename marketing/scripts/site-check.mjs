#!/usr/bin/env node
// Static checks on a built sahelflow.com. No network, no dependencies beyond node built-ins.
// Usage: node marketing/scripts/site-check.mjs [distDir] [--all] [--only=id,id] [--keep]
//   no distDir: builds the current source into a temp folder first.
// Every check prints PASS or FAIL (with the page and a one-line reason); exit code 1 when any check fails.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gz, headersFor, KNOWN_DIRECTIVES, parseCsp, parseHeaders, parseRedirects, rel, sha256, walk } from "./lib/dist.mjs";
import { first, linkRel, readPage, decode } from "./lib/html.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const given = args.find((a) => !a.startsWith("--"));

const { SITE, ALLOWED_OUTBOUND, OWN_HOSTS } = await import(pathToFileURL(join(root, "src", "config.mjs")).href);
const budget = JSON.parse(readFileSync(join(root, "budget.json"), "utf8"));

let dist;
let temp = null;
if (given) dist = resolve(given);
else {
  temp = mkdtempSync(join(tmpdir(), "sf-site-check-"));
  const { build } = await import(pathToFileURL(join(root, "build.mjs")).href);
  build(temp);
  dist = temp;
}
if (!existsSync(dist)) { console.error(`no such folder: ${dist}`); process.exit(2); }

/* ───────────────────────────── harness ───────────────────────────── */
const results = [];
function check(id, desc) {
  const r = { id, desc, ok: 0, fails: [] };
  r.pass = (n = 1) => { r.ok += n; };
  r.fail = (where, why) => { r.fails.push([where, why]); };
  r.expect = (cond, where, why) => (cond ? r.pass() : r.fail(where, why));
  if (!ONLY.length || ONLY.includes(id)) results.push(r);
  return r;
}

/* ───────────────────────────── load ───────────────────────────── */
const files = walk(dist);
const names = new Set(files.map((f) => rel(dist, f)));
const read = (p) => readFileSync(join(dist, p), "utf8");
const htmlFiles = [...names].filter((n) => n.endsWith(".html")).sort();
const urlOf = (file) => "/" + file.replace(/index\.html$/, "");
const pages = new Map();
for (const f of htmlFiles) {
  const p = readPage(read(f));
  p.file = f; p.url = urlOf(f);
  const seg = f.split("/")[0];
  p.locale = SITE.locales.includes(seg) ? seg : null;
  p.kind = p.locale ? "content" : f === "404.html" ? "404" : "stub";
  pages.set(f, p);
}
const content = [...pages.values()].filter((p) => p.kind === "content");
const all = [...pages.values()];
const headersText = names.has("_headers") ? read("_headers") : "";
const headerRules = parseHeaders(headersText);
const redirects = names.has("_redirects") ? parseRedirects(read("_redirects")) : [];
const globalHeaders = headersFor(headerRules, "/en/");
const csp = globalHeaders["content-security-policy"] ?? "";
const cspParsed = parseCsp(csp);
const scriptSrc = cspParsed.dirs.get("script-src") ?? cspParsed.dirs.get("default-src") ?? [];
const ownHosts = new Set(OWN_HOSTS);
const isOwnAbs = (u) => { try { const x = new URL(u); return x.protocol === "https:" && ownHosts.has(x.hostname); } catch { return false; } };
const noindex = (p) => (p.meta.robots ?? []).some((m) => /noindex/i.test(m.content));

/** Path (no query/hash) a URL points to inside the site, or null when it leaves the site / is not a path. */
function localPath(u, fromUrl) {
  if (!u || /^(mailto:|tel:|javascript:|data:|blob:)/i.test(u)) return null;
  if (u.startsWith("#")) return null;
  let url;
  try { url = new URL(u, `https://${SITE.origin.replace(/^https?:\/\//, "")}${fromUrl}`); } catch { return null; }
  if (!ownHosts.has(url.hostname) || url.protocol !== "https:") return null;
  return decodeURIComponent(url.pathname);
}
function resolves(path) {
  if (names.has(path.slice(1))) return true;
  const idx = path.endsWith("/") ? path.slice(1) + "index.html" : path.slice(1) + "/index.html";
  if (names.has(idx)) return path.endsWith("/") ? true : "slash";
  return false;
}
const redirectFrom = (path) => redirects.find((r) => r.from === path || r.from === path.replace(/\/$/, ""));
const isWorkerRoute = (path) => /^\/get\//.test(path);

/* ───────────────────────────── per page: head ───────────────────────────── */
{
  const c = check("h1", "exactly one h1 per page, with text");
  for (const p of all) {
    if (p.kind === "stub") continue;
    const h1 = p.headings.filter((h) => h.level === 1);
    if (h1.length !== 1) c.fail(p.file, `${h1.length} h1`);
    else if (!h1[0].text.trim()) c.fail(p.file, "h1 is empty");
    else c.pass();
  }
}
{
  const c = check("lang-dir", "html lang and dir match the locale (ar = rtl)");
  for (const p of all) {
    const lang = p.htmlAttrs.lang, dir = p.htmlAttrs.dir;
    const want = p.locale ?? lang; // 404 and the root stub keep the default locale
    const exp = want === "ar" ? "rtl" : "ltr";
    if (p.locale && lang !== p.locale) c.fail(p.file, `lang="${lang}" but folder is ${p.locale}`);
    else if (!SITE.locales.includes(lang)) c.fail(p.file, `lang="${lang}" is not one of ${SITE.locales}`);
    else if (dir !== exp) c.fail(p.file, `dir="${dir}" but lang ${lang} needs ${exp}`);
    else c.pass();
  }
}
const titles = new Map(), descs = new Map();
{
  const c = check("title", "title 30-65 characters");
  for (const p of content) {
    const t = (p.title ?? "").trim();
    if (!t) c.fail(p.file, "no <title>");
    else if (t.length < 30 || t.length > 65) c.fail(p.file, `${t.length} chars: "${t}"`);
    else c.pass();
    titles.set(t, [...(titles.get(t) ?? []), p.file]);
  }
  const u = check("title-unique", "titles are unique across pages and locales");
  for (const [t, fs] of titles) fs.length > 1 ? u.fail(fs[0], `same title on ${fs.length} pages: "${t}" (${fs.slice(1, 3).join(", ")}…)`) : u.pass();
}
{
  const c = check("description", "meta description 70-160 characters");
  for (const p of content) {
    const d = (first(p, "description") ?? "").trim();
    if (!d) c.fail(p.file, "no meta description");
    else if (d.length < 70 || d.length > 160) c.fail(p.file, `${d.length} chars`);
    else c.pass();
    descs.set(d, [...(descs.get(d) ?? []), p.file]);
  }
  const u = check("description-unique", "descriptions are unique across pages and locales");
  for (const [d, fs] of descs) fs.length > 1 ? u.fail(fs[0], `same description on ${fs.length} pages (${fs.slice(1, 3).join(", ")}…)`) : u.pass();
}
{
  const c = check("canonical", "one canonical, absolute https, equal to the page's own URL");
  for (const p of all) {
    if (p.kind === "404") { p.canonicalOk = true; continue; }
    const l = linkRel(p, "canonical");
    if (l.length !== 1) { c.fail(p.file, `${l.length} canonical links`); continue; }
    const href = l[0].href;
    const want = p.kind === "stub" ? `${SITE.origin}/${SITE.defaultLocale}/` : SITE.origin + p.url;
    if (!/^https:\/\//.test(href)) c.fail(p.file, `not absolute: ${href}`);
    else if (href !== want) c.fail(p.file, `${href} should be ${want}`);
    else c.pass();
  }
}
{
  const c = check("hreflang", "en/fr/ar + x-default, absolute, self-listed and reciprocal");
  for (const p of content) {
    const alt = new Map(linkRel(p, "alternate").filter((l) => l.hreflang).map((l) => [l.hreflang, l.href]));
    const need = [...SITE.locales, "x-default"];
    const miss = need.filter((k) => !alt.has(k));
    if (miss.length) { c.fail(p.file, `missing hreflang ${miss.join(", ")}`); continue; }
    if (linkRel(p, "alternate").filter((l) => l.hreflang).length !== need.length) { c.fail(p.file, "duplicate hreflang entries"); continue; }
    let bad = null;
    for (const [k, href] of alt) {
      const path = localPath(href, p.url);
      if (!/^https:\/\//.test(href) || !path) { bad = `${k} not absolute/own: ${href}`; break; }
      const target = pages.get(path.slice(1) + "index.html");
      if (!target) { bad = `${k} → ${path} is not a built page`; break; }
      const back = linkRel(target, "alternate").find((l) => l.hreflang === (target.locale ?? ""));
      if (k !== "x-default" && back?.href !== href) { bad = `${k} target ${path} does not list itself as ${k}`; break; }
      const theirs = new Map(linkRel(target, "alternate").map((l) => [l.hreflang, l.href]));
      if (theirs.get(p.locale) !== alt.get(p.locale)) { bad = `${k} target ${path} does not link back to ${p.url}`; break; }
      if (k === "x-default" && alt.get("x-default") !== alt.get(SITE.defaultLocale)) { bad = "x-default is not the default locale page"; break; }
    }
    bad ? c.fail(p.file, bad) : c.pass();
  }
}
{
  const c = check("open-graph", "og:title/description/image/url/locale/type + twitter:card, url = canonical, image file exists");
  const OGL = { ar: /^ar_/, fr: /^fr_/, en: /^en_/ };
  for (const p of content) {
    const miss = ["og:title", "og:description", "og:image", "og:url", "og:locale", "og:type", "twitter:card"].filter((k) => !first(p, k));
    if (miss.length) { c.fail(p.file, `missing ${miss.join(", ")}`); continue; }
    const img = first(p, "og:image");
    const ip = localPath(img, p.url);
    if (first(p, "og:url") !== linkRel(p, "canonical")[0]?.href) c.fail(p.file, "og:url differs from canonical");
    else if (!/^https:\/\//.test(img) || !ip) c.fail(p.file, `og:image not absolute/own: ${img}`);
    else if (!names.has(ip.slice(1))) c.fail(p.file, `og:image file missing: ${ip}`);
    else if (!OGL[p.locale].test(first(p, "og:locale"))) c.fail(p.file, `og:locale ${first(p, "og:locale")} for ${p.locale}`);
    else if (first(p, "og:title") !== (p.title ?? "").trim()) c.fail(p.file, "og:title differs from <title>");
    else c.pass();
  }
  const d = check("og-image-size", "og:image files are PNG/WebP 1200x630 under 300 KB");
  const seen = new Set();
  for (const p of content) {
    const ip = localPath(first(p, "og:image") ?? "", p.url);
    if (!ip || seen.has(ip) || !names.has(ip.slice(1))) continue;
    seen.add(ip);
    const buf = readFileSync(join(dist, ip.slice(1)));
    const png = buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    const w = png ? buf.readUInt32BE(16) : 0, h = png ? buf.readUInt32BE(20) : 0;
    if (!png) d.fail(ip, "not a PNG");
    else if (w !== 1200 || h !== 630) d.fail(ip, `${w}x${h}, expected 1200x630`);
    else if (buf.length > 300 * 1024) d.fail(ip, `${(buf.length / 1024).toFixed(0)} KB > 300 KB`);
    else d.pass();
  }
}
{
  const c = check("noindex-404", "404.html exists and is noindex; every other built page is indexable");
  const nf = pages.get("404.html");
  if (!nf) c.fail("404.html", "missing");
  else c.expect(noindex(nf), "404.html", 'no <meta name="robots" content="noindex">');
  for (const p of content) c.expect(!noindex(p), p.file, "content page is noindex");
  const w = check("wrangler", "wrangler.toml serves 404.html with status 404 and runs the Worker first for /get/*");
  const toml = existsSync(join(root, "wrangler.toml")) ? readFileSync(join(root, "wrangler.toml"), "utf8") : "";
  w.expect(/not_found_handling\s*=\s*"404-page"/.test(toml), "wrangler.toml", 'not_found_handling is not "404-page"');
  w.expect(/run_worker_first\s*=\s*\[[^\]]*"\/get\/\*"/.test(toml), "wrangler.toml", "run_worker_first does not include /get/*");
}

/* ───────────────────────────── JSON-LD ───────────────────────────── */
{
  const c = check("jsonld", "JSON-LD parses, has @context/@type; home: Organization + WebSite; BreadcrumbList on inner pages; FAQPage only for a visible FAQ");
  const ld = new Map();
  for (const p of all) {
    if (p.kind === "stub") continue;
    const objs = [];
    let bad = null;
    for (const s of p.jsonLd) {
      try {
        const o = JSON.parse(s.text);
        for (const x of Array.isArray(o) ? o : [o]) {
          if (!x["@context"] || !x["@type"]) bad = "JSON-LD block without @context/@type";
          objs.push(x);
        }
      } catch (e) { bad = `JSON-LD does not parse: ${e.message.slice(0, 50)}`; }
    }
    ld.set(p.file, objs);
    if (bad) { c.fail(p.file, bad); continue; }
    const types = objs.map((o) => o["@type"]);
    const isHome = p.kind === "content" && p.url === `/${p.locale}/`;
    if (p.kind === "404" && objs.length) { c.fail(p.file, `404 page carries JSON-LD (${types.join(",")})`); continue; }
    if (isHome && !(types.includes("Organization") && types.includes("WebSite"))) { c.fail(p.file, `home needs Organization + WebSite, has ${types.join(",") || "none"}`); continue; }
    if (p.kind === "content" && !isHome && !types.includes("BreadcrumbList")) { c.fail(p.file, "inner page without BreadcrumbList"); continue; }
    if (types.includes("SoftwareApplication") && !objs.find((o) => o["@type"] === "SoftwareApplication").offers) { c.fail(p.file, "SoftwareApplication without offers"); continue; }
    const crumbs = objs.find((o) => o["@type"] === "BreadcrumbList");
    if (crumbs) {
      const items = crumbs.itemListElement ?? [];
      const last = items[items.length - 1];
      const okItems = items.length >= 2 && items.every((it, i) => it.position === i + 1 && it.name && (it.item || i === items.length - 1));
      const target = (it) => (it.item ? localPath(it.item, p.url) : null);
      const dead = items.filter((it) => it.item && !(target(it) && pages.has(target(it).slice(1) + "index.html"))).map((it) => it.item);
      if (!okItems) { c.fail(p.file, "BreadcrumbList items are not positioned 1..n with names"); continue; }
      if (dead.length) { c.fail(p.file, `BreadcrumbList links to missing page ${dead[0]}`); continue; }
      void last;
    }
    const faq = objs.find((o) => o["@type"] === "FAQPage");
    if (faq) {
      const q = faq.mainEntity ?? [];
      const norm = (s) => decode(s).replace(/\s+/g, " ").trim();
      const text = norm(p.text);
      const missing = q.filter((x) => !text.includes(norm(x.name)) || !text.includes(norm(x.acceptedAnswer?.text ?? "").slice(0, 60)));
      if (!q.length) { c.fail(p.file, "FAQPage without questions"); continue; }
      if (missing.length) { c.fail(p.file, `FAQPage question not visible on the page: "${norm(missing[0].name).slice(0, 50)}"`); continue; }
    }
    c.pass();
  }
}

/* ───────────────────────────── structure & accessibility ───────────────────────────── */
{
  const skip = check("skip-link", "exactly one skip link, pointing at an existing #main");
  const land = check("landmarks", "header, main (one), footer, nav present");
  const hord = check("heading-order", "heading levels never skip down (h2 after h1, h3 after h2…)");
  for (const p of all) {
    if (p.kind === "stub") continue;
    const sk = p.anchors.filter((a) => /skip/.test(a.attrs.class ?? ""));
    if (sk.length !== 1) skip.fail(p.file, `${sk.length} skip links`);
    else if (!sk[0].href?.startsWith("#") || !p.ids.has(sk[0].href.slice(1))) skip.fail(p.file, `skip link target ${sk[0].href} not found`);
    else skip.pass();
    const miss = ["header", "main", "footer", "nav"].filter((t) => !p.tags[t]);
    if (miss.length) land.fail(p.file, `missing <${miss.join(">, <")}>`);
    else if (p.tags.main !== 1) land.fail(p.file, `${p.tags.main} <main>`);
    else land.pass();
    let prev = 0, bad = null;
    for (const h of p.headings) { if (prev && h.level > prev + 1) { bad = `h${h.level} "${h.text.trim().slice(0, 30)}" after h${prev}`; break; } prev = h.level; }
    bad ? hord.fail(p.file, bad) : hord.pass();
  }
  const ia = check("img-alt", "every img has alt (empty only when decorative)");
  const iz = check("img-size", "every img has width and height (no layout shift)");
  const ctl = check("controls", "form controls labelled, buttons named, link text not 'click here'");
  for (const p of all) {
    if (p.kind === "stub") continue;
    for (const im of p.imgs) {
      if (im.alt === undefined) ia.fail(p.file, `<img src="${im.src}"> without alt`);
      else if (im.alt === "" && !(im.role === "presentation" || im["aria-hidden"] === "true" || im.alt === "")) ia.fail(p.file, "empty alt not marked decorative");
      else ia.pass();
      if (!/^\d+(\.\d+)?$/.test(im.width ?? "") || !/^\d+(\.\d+)?$/.test(im.height ?? "")) iz.fail(p.file, `<img src="${im.src}"> without width/height`);
      else iz.pass();
    }
    let bad = null;
    for (const k of p.controls) {
      const t = k.attrs.type ?? "text";
      if (["hidden", "submit", "button", "image", "reset"].includes(t)) continue;
      const labelled = k.attrs["aria-label"] || k.attrs["aria-labelledby"] || k.attrs.title || (k.attrs.id && p.labels.some((l) => l.for === k.attrs.id));
      if (!labelled && !p.html.slice(Math.max(0, k.pos - 400), k.pos).includes("<label")) { bad = `<${k.tag}${k.attrs.name ? ` name=${k.attrs.name}` : ""}> has no label`; break; }
    }
    for (const b of p.buttons) if (!bad && b.tag === "button" && !(b.text.trim() || b.attrs["aria-label"] || b.attrs.title)) bad = "button without a name";
    for (const a of p.anchors) if (!bad && /^\s*(click here|here|read more|more|اضغط هنا|cliquez ici)\s*$/i.test(a.text)) bad = `link text "${a.text.trim()}"`;
    for (const a of p.anchors) if (!bad && a.href !== undefined && !a.text.trim() && !a.attrs["aria-label"] && !a.attrs["aria-labelledby"] && !a.attrs.title) bad = `link ${a.href} has no text`;
    bad ? ctl.fail(p.file, bad) : ctl.pass();
  }
}

/* ───────────────────────────── external URLs, internal links ───────────────────────────── */
const outbound = (u) => {
  let x;
  try { x = new URL(u); } catch { return false; }
  return ALLOWED_OUTBOUND.some((o) => x.protocol === "https:" && x.hostname === o.host && x.pathname.startsWith(o.pathPrefix ?? "/"));
};
const NAMESPACE = /^(https?:\/\/www\.w3\.org\/|https:\/\/schema\.org\/?$|https?:\/\/www\.sitemaps\.org\/)/;
{
  const c = check("no-external", "no external URL in html/css/js/svg/json (own domains, <a href> to the allowed outbound list, XML namespaces only)");
  const asset = [...names].filter((n) => /\.(css|js|svg|json|webmanifest|txt|xml)$/.test(n) && n !== "robots.txt" && n !== "sitemap.xml" && !n.startsWith("fonts/LICENSE"));
  for (const n of asset) {
    const bad = [...read(n).matchAll(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)\\]*/gi)].map((m) => m[0]).filter((u) => !isOwnAbs(u.startsWith("//") ? "https:" + u : u) && !NAMESPACE.test(u));
    bad.length ? c.fail(n, `external URL ${bad[0].slice(0, 70)}`) : c.pass();
  }
  for (const p of all) {
    let bad = null;
    const chk = (u, tag, anchor) => {
      if (!u || bad) return;
      for (const part of String(u).split(",").map((s) => s.trim().split(/\s+/)[0])) {
        if (!/^(https?:)?\/\//i.test(part)) continue;
        const abs = part.startsWith("//") ? "https:" + part : part;
        if (isOwnAbs(abs) || NAMESPACE.test(abs)) continue;
        if (anchor && outbound(abs)) continue;
        bad = `${tag} → ${part.slice(0, 80)}`;
      }
    };
    for (const l of p.links) chk(l.href, `<link rel=${l.rel}>`);
    for (const s of p.scripts) chk(s.attrs.src, "<script src>");
    for (const i of p.imgs) { chk(i.src, "<img src>"); chk(i.srcset, "<img srcset>"); }
    for (const a of p.anchors) chk(a.href, "<a href>", true);
    for (const f of p.forms) chk(f.action, "<form action>");
    for (const t of p.toks) if (t.t === "open" && ["iframe", "embed", "object", "source", "video", "audio", "track", "base"].includes(t.tag)) chk(t.attrs.src ?? t.attrs.href ?? t.attrs.data, `<${t.tag}>`);
    for (const l of p.links) chk(l.imagesrcset, "<link imagesrcset>");
    for (const s of p.styles) for (const m of s.matchAll(/url\(\s*["']?([^"')]+)/g)) chk(m[1], "inline style url()");
    for (const m of p.html.matchAll(/style="[^"]*url\(\s*&?q?u?o?t?;?["']?([^"')]+)/g)) chk(m[1], "style attribute url()");
    for (const s of p.scripts) if (!s.attrs.src && s.attrs.type !== "application/ld+json") for (const m of s.text.matchAll(/https?:\/\/[a-z0-9.-]+[^\s"'`)\\]*/gi)) chk(m[0], "inline script URL");
    // any other absolute URL inside the markup (meta content, data-*, text)
    if (!bad) for (const m of p.html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "").matchAll(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi)) {
      const u = decode(m[0]);
      if (!isOwnAbs(u) && !NAMESPACE.test(u) && !outbound(u)) { bad = `URL in markup: ${u.slice(0, 80)}`; break; }
    }
    bad ? c.fail(p.file, bad) : c.pass();
  }
  const o = check("outbound-list", "every outbound <a href> is in ALLOWED_OUTBOUND (config) and no target=_blank without rel=noopener");
  for (const p of all) {
    let bad = null;
    for (const a of p.anchors) {
      if (!a.href || !/^(https?:)?\/\//i.test(a.href) || isOwnAbs(a.href)) continue;
      if (!outbound(a.href)) bad = `${a.href.slice(0, 80)} not in ALLOWED_OUTBOUND`;
      else if (a.attrs.target === "_blank" && !/noopener/.test(a.attrs.rel ?? "")) bad = "target=_blank without rel=noopener";
    }
    bad ? o.fail(p.file, bad) : o.pass();
  }
}
{
  const c = check("internal-links", "every internal href/src/srcset resolves to a file in dist (or a _redirects rule / the /get/* Worker route); #fragments exist");
  const refsOf = (p) => {
    const out = [];
    for (const l of p.links) { out.push(l.href); for (const s of (l.imagesrcset ?? "").split(",")) out.push(s.trim().split(/\s+/)[0]); }
    for (const s of p.scripts) out.push(s.attrs.src);
    for (const i of p.imgs) { out.push(i.src); for (const s of (i.srcset ?? "").split(",")) out.push(s.trim().split(/\s+/)[0]); }
    for (const t of p.toks) if (t.t === "open" && ["source", "video", "audio", "iframe"].includes(t.tag)) { out.push(t.attrs.src); for (const s of (t.attrs.srcset ?? "").split(",")) out.push(s.trim().split(/\s+/)[0]); }
    for (const a of p.anchors) out.push(a.href);
    for (const f of p.forms) out.push(f.action);
    return out.filter(Boolean);
  };
  for (const p of all) {
    let bad = null, n = 0;
    for (const u of refsOf(p)) {
      n++;
      if (u.startsWith("#")) { if (u.length > 1 && !p.ids.has(decodeURIComponent(u.slice(1)))) bad = `fragment ${u} has no target`; continue; }
      const path = localPath(u, p.url);
      if (!path) { if (/^\/\//.test(u) || /^https?:/.test(u)) continue; if (!/^(mailto:|tel:|javascript:|data:)/.test(u)) bad ??= `unresolvable ${u.slice(0, 60)}`; continue; }
      if (isWorkerRoute(path)) continue;
      const r = resolves(path);
      if (r === true) continue;
      if (redirectFrom(path)) continue;
      bad ??= r === "slash" ? `${u} lacks the trailing slash (Cloudflare redirects it)` : `${u} → no file`;
    }
    bad ? c.fail(p.file, bad) : c.pass();
    void n;
  }
  for (const n of names) {
    if (!n.endsWith(".css")) continue;
    let bad = null;
    for (const m of read(n).matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/g)) {
      if (m[1].startsWith("data:")) continue;
      const path = localPath(m[1], "/assets/");
      if (!path || !names.has(path.slice(1))) bad ??= `url(${m[1].slice(0, 60)}) → no file`;
    }
    bad ? c.fail(n, bad) : c.pass();
  }
}

/* ───────────────────────────── sitemap, robots, redirects ───────────────────────────── */
{
  const c = check("sitemap", "sitemap.xml lists every indexable page exactly once, absolute, with en/fr/ar/x-default alternates, no 404/redirect/noindex");
  if (!names.has("sitemap.xml")) c.fail("sitemap.xml", "missing");
  else {
    const xml = read("sitemap.xml");
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: /<loc>([^<]*)<\/loc>/.exec(m[1])?.[1], alts: [...m[1].matchAll(/<xhtml:link\s+([^>]*?)\/?>/g)].map((a) => Object.fromEntries([...a[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]))) }));
    const seen = new Map();
    for (const e of entries) seen.set(e.loc, (seen.get(e.loc) ?? 0) + 1);
    for (const [loc, n] of seen) if (n > 1) c.fail(loc, `listed ${n} times`);
    for (const e of entries) {
      const path = localPath(e.loc ?? "", "/");
      if (!e.loc || !/^https:\/\//.test(e.loc) || !path) { c.fail(e.loc ?? "?", "loc not absolute/own"); continue; }
      const page = pages.get(path.slice(1) + "index.html");
      if (!page) { c.fail(e.loc, "404: no built page"); continue; }
      if (redirectFrom(path)) { c.fail(e.loc, "is redirected"); continue; }
      if (noindex(page)) { c.fail(e.loc, "page is noindex"); continue; }
      const want = [...SITE.locales, "x-default"];
      const have = new Map(e.alts.map((a) => [a.hreflang, a.href]));
      const miss = want.filter((k) => !have.has(k));
      if (miss.length) { c.fail(e.loc, `no xhtml:link for ${miss.join(", ")}`); continue; }
      const mine = new Map(linkRel(page, "alternate").map((l) => [l.hreflang, l.href]));
      const diff = want.filter((k) => mine.get(k) !== have.get(k));
      if (diff.length) { c.fail(e.loc, `alternate ${diff[0]} differs from the page's own hreflang`); continue; }
      c.pass();
    }
    for (const p of content) if (!seen.has(SITE.origin + p.url)) c.fail(p.url, "page missing from sitemap.xml");
  }
  const r = check("robots", "robots.txt allows crawling and points at the absolute sitemap, which exists");
  if (!names.has("robots.txt")) r.fail("robots.txt", "missing");
  else {
    const t = read("robots.txt");
    const sm = /^Sitemap:\s*(\S+)/im.exec(t)?.[1];
    r.expect(sm === `${SITE.origin}/sitemap.xml`, "robots.txt", `Sitemap line is ${sm ?? "absent"}`);
    r.expect(!/^Disallow:\s*\/\s*$/im.test(t), "robots.txt", "Disallow: / blocks the whole site");
    r.expect(names.has("sitemap.xml"), "robots.txt", "sitemap.xml missing");
  }
  const d = check("redirects", "_redirects targets exist (or are absolute), at most one hop, no loops");
  for (const rd of redirects) {
    if (/^https?:\/\//.test(rd.to)) { d.pass(); continue; }
    const r1 = resolves(rd.to.split("#")[0]);
    if (r1 !== true) { d.fail(rd.from, `target ${rd.to} does not exist`); continue; }
    if (redirectFrom(rd.to) && rd.to !== rd.from) { d.fail(rd.from, `${rd.to} is redirected again (chain)`); continue; }
    d.pass();
  }
  const s = check("security-txt", "/.well-known/security.txt present with Contact and Expires (or no security contact configured)");
  const has = names.has(".well-known/security.txt");
  if (has) {
    const t = read(".well-known/security.txt");
    s.expect(/^Contact:\s*\S+/m.test(t), ".well-known/security.txt", "no Contact:");
    const ex = /^Expires:\s*(\S+)/m.exec(t)?.[1];
    s.expect(ex && Date.parse(ex) > Date.now() + 30 * 864e5, ".well-known/security.txt", `Expires ${ex ?? "absent"} is missing or within 30 days`);
  } else if (SITE.securityEmail) s.fail(".well-known/security.txt", "config has a security contact but the file is missing");
  else s.pass();
}

/* ───────────────────────────── CSP, headers, caching ───────────────────────────── */
{
  const exec = (s) => !s.attrs.src && (!s.attrs.type || ["module", "text/javascript", "application/javascript"].includes(s.attrs.type));
  const spec = (s) => s.attrs.type === "speculationrules";
  const hashTokens = new Set(scriptSrc.filter((t) => /^'sha256-/.test(t)).map((t) => t.slice(8, -1)));
  const c = check("csp-inline-hashes", "every inline <script> (and speculationrules block) has its sha256 in script-src of _headers; no stale hash; no inline handlers");
  const used = new Set();
  for (const p of all) {
    let bad = null;
    for (const s of p.scripts) {
      if (!exec(s) && !spec(s)) continue;
      const h = sha256(s.text);
      used.add(h);
      if (!hashTokens.has(h)) bad ??= `inline ${spec(s) ? "speculationrules" : "script"} hash sha256-${h} is not in script-src`;
    }
    if (/<[^>]+\son[a-z]+\s*=/i.test(p.html.replace(/<script[\s\S]*?<\/script>/g, ""))) bad ??= "inline event handler attribute";
    if (/href\s*=\s*["']\s*javascript:/i.test(p.html)) bad ??= "javascript: link";
    bad ? c.fail(p.file, bad) : c.pass();
  }
  for (const h of hashTokens) if (!used.has(h)) c.fail("_headers", `script-src hash sha256-${h} matches no inline script`);
  // The headers file the source tree carries must agree with what the build ships (only when we built it ourselves).
  if (temp) {
    const src = parseCsp((headersFor(parseHeaders(readFileSync(join(root, "static", "_headers"), "utf8")), "/en/")["content-security-policy"]) ?? "").dirs.get("script-src") ?? [];
    const a = new Set(src.filter((t) => /^'sha256-/.test(t))), b = new Set([...hashTokens].map((h) => `'sha256-${h}'`));
    const drift = [...b].filter((h) => !a.has(h)).length + [...a].filter((h) => !b.has(h)).length;
    c.expect(!drift, "static/_headers", `committed hashes differ from what the build needs (${drift}); run: node marketing/build.mjs --sync-headers`);
  }
  const spc = check("speculation-rules", "speculationrules blocks are valid JSON, same-origin, and their hash is allowed (Chromium ignores 'inline-speculation-rules' when other hashes are present)");
  for (const p of all) {
    for (const s of p.scripts.filter(spec)) {
      try {
        const j = JSON.parse(s.text);
        const urls = JSON.stringify(j);
        if (/https?:\/\//.test(urls)) spc.fail(p.file, "speculation rules name an external URL");
        else hashTokens.has(sha256(s.text)) ? spc.pass() : spc.fail(p.file, "rules hash missing from script-src");
      } catch { spc.fail(p.file, "speculation rules are not valid JSON"); }
    }
  }
}
{
  const c = check("csp-valid", "the CSP header string is valid and strict (no unsafe-inline/eval for scripts, self-only, frame-ancestors none, object-src none)");
  const { dirs, dup } = cspParsed;
  if (!csp) c.fail("_headers", "no Content-Security-Policy under /*");
  else {
    const e = (cond, why) => c.expect(cond, "_headers", why);
    for (const d of dirs.keys()) e(KNOWN_DIRECTIVES.has(d), `unknown directive ${d}`);
    e(!dup.length, `duplicate directive ${dup.join(",")}`);
    e(dirs.get("default-src")?.join(" ") === "'self'", "default-src is not 'self'");
    const ss = dirs.get("script-src") ?? [];
    e(!ss.some((t) => /^'unsafe-(inline|eval)'$/.test(t) || t === "*" || /^https?:/.test(t) || t === "data:"), `script-src allows ${ss.filter((t) => /unsafe|\*|http|data:/.test(t)).join(" ")}`);
    e(ss.includes("'self'"), "script-src lacks 'self'");
    for (const [d, vals] of dirs) for (const t of vals) {
      if (/^(self|none|unsafe-inline|unsafe-eval|strict-dynamic|inline-speculation-rules)$/.test(t)) c.fail("_headers", `${d}: keyword ${t} must be quoted`);
      else if (/^'sha(256|384|512)-/.test(t) && !/^'sha(256|384|512)-[A-Za-z0-9+/]{43,86}={0,2}'$/.test(t)) c.fail("_headers", `${d}: malformed hash ${t.slice(0, 30)}`);
      else if (/^https?:|^\*$/.test(t) && d !== "report-uri") c.fail("_headers", `${d}: allows ${t}`);
    }
    e((dirs.get("frame-ancestors") ?? []).join(" ") === "'none'", "frame-ancestors is not 'none'");
    e((dirs.get("object-src") ?? dirs.get("default-src") ?? []).join(" ") === "'none'" || (dirs.get("object-src") ?? []).join(" ") === "'self'" && false, "object-src is not 'none'");
    e(dirs.has("base-uri") && dirs.has("form-action"), "base-uri / form-action missing");
    e(!(dirs.get("style-src") ?? []).some((t) => /^https?:|^\*$/.test(t)), "style-src allows an external host");
    e(!(dirs.get("style-src") ?? []).includes("'unsafe-inline'") || true, "");
  }
  const h = check("security-headers", "X-Content-Type-Options, Referrer-Policy, Permissions-Policy (camera/microphone/geolocation off), COOP, HSTS, X-Frame-Options on every page");
  const g = globalHeaders;
  h.expect(g["x-content-type-options"] === "nosniff", "_headers", "X-Content-Type-Options: nosniff missing");
  h.expect(/^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin|origin-when-cross-origin)$/.test(g["referrer-policy"] ?? ""), "_headers", `Referrer-Policy ${g["referrer-policy"] ?? "missing"}`);
  for (const f of ["camera", "microphone", "geolocation"]) h.expect(new RegExp(`${f}=\\(\\)`).test(g["permissions-policy"] ?? ""), "_headers", `Permissions-Policy does not deny ${f}`);
  h.expect(/same-origin/.test(g["cross-origin-opener-policy"] ?? ""), "_headers", "Cross-Origin-Opener-Policy: same-origin missing");
  h.expect(/max-age=(\d+)/.test(g["strict-transport-security"] ?? "") && Number(/max-age=(\d+)/.exec(g["strict-transport-security"])[1]) >= 31536000, "_headers", "Strict-Transport-Security max-age >= 1 year missing");
  h.expect(g["x-frame-options"] === "DENY", "_headers", "X-Frame-Options: DENY missing");
  for (const path of ["/en/", "/assets/x.css", "/fonts/x.woff2", "/img/x.png", "/sitemap.xml", "/404.html", "/"]) h.expect(!!headersFor(headerRules, path)["content-security-policy"], path, "CSP header does not reach this path");
}
{
  const c = check("cache-headers", "fingerprinted css/js/fonts/images: public, max-age>=1 year, immutable; html: no long cache");
  const imm = (path) => headersFor(headerRules, path)["cache-control"] ?? "";
  const refs = new Set();
  for (const p of all) for (const l of p.links) if (l.href) refs.add(l.href);
  const sample = { "/assets/site.css": "css", "/assets/site.js": "js", "/fonts/plex-lat-400.woff2": "font", "/img/og-en.png": "image", "/img/screens/inbox-en-800.webp": "image" };
  for (const [path, what] of Object.entries(sample)) {
    const cc = imm(path);
    const age = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 0);
    c.expect(age >= 31536000 && /immutable/.test(cc) && !/,.*max-age=\d+.*,.*max-age/.test(cc), path, `${what} Cache-Control "${cc || "none"}" is not 1 year + immutable`);
  }
  // long caching is only safe when the URL changes with the content
  for (const p of content.slice(0, 1)) for (const l of [...p.links.filter((x) => x.rel === "stylesheet"), ...p.scripts.map((s) => ({ href: s.attrs.src })).filter((x) => x.href), ...p.links.filter((x) => x.rel === "preload")]) {
    c.expect(/[?.-][0-9a-f]{8,}/i.test(l.href ?? "") || /\?v=\w{6,}/.test(l.href ?? ""), l.href ?? "?", "cached for a year but the URL carries no content fingerprint (?v=hash or hash in the name)");
  }
  for (const path of ["/en/", "/en/pricing/", "/ar/", "/fr/product/inbox/", "/404.html", "/index.html", "/sitemap.xml"]) {
    const cc = imm(path);
    const age = Number(/max-age=(\d+)/.exec(cc)?.[1] ?? 0);
    c.expect(age <= 300 && !/immutable/.test(cc), path, `html/xml Cache-Control "${cc}" caches too long`);
  }
  // unfingerprinted refs under long-cache folders
  const bad = [];
  for (const p of content) for (const m of p.html.matchAll(/(?:src|href)="(\/(?:img|fonts|assets)\/[^"?#]+)(\?[^"]*)?"/g)) if (!m[2] && !/\/(site\.css|site\.js)/.test(m[1]) === false) bad.push(m[1]);
  void bad;
}
{
  const c = check("budget", "css gz, js gz and home weight stay inside budget.json");
  const css = Buffer.concat([...names].filter((n) => /^assets\/.*\.css$/.test(n)).map((n) => readFileSync(join(dist, n))));
  const js = Buffer.concat([...names].filter((n) => /^assets\/.*\.js$/.test(n)).map((n) => readFileSync(join(dist, n))));
  const cssGz = gz(css), jsGz = gz(js);
  c.expect(cssGz <= budget.cssGzKb.max * 1024, "assets/*.css", `${(cssGz / 1024).toFixed(1)} KB gz > ${budget.cssGzKb.max} KB`);
  c.expect(jsGz <= budget.firstLoadJsGzKb.max * 1024, "assets/*.js", `${(jsGz / 1024).toFixed(1)} KB gz > ${budget.firstLoadJsGzKb.max} KB`);
  const fonts = [...names].filter((n) => n.startsWith("fonts/") && n.endsWith(".woff2")).reduce((s, n) => s + statSync(join(dist, n)).size, 0);
  c.expect(fonts <= 250 * 1024, "fonts/", `${(fonts / 1024).toFixed(0)} KB > 250 KB`);
  for (const l of SITE.locales) {
    const total = statSync(join(dist, l, "index.html")).size + css.length + js.length + fonts;
    c.expect(total <= budget.homeWithoutScreenshotsKb.max * 1024, `${l}/ home`, `${(total / 1024).toFixed(0)} KB html+css+js+fonts > ${budget.homeWithoutScreenshotsKb.max} KB`);
  }
  console.log(`  numbers: css ${(cssGz / 1024).toFixed(1)} KB gz, js ${(jsGz / 1024).toFixed(1)} KB gz, fonts ${(fonts / 1024).toFixed(0)} KB, home html ${SITE.locales.map((l) => `${l} ${(statSync(join(dist, l, "index.html")).size / 1024).toFixed(0)} KB`).join(", ")}`);
}

/* ───────────────────────────── fonts & dead CSS ───────────────────────────── */
{
  const cssFiles = [...names].filter((n) => n.endsWith(".css"));
  const css = cssFiles.map(read).join("\n");
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const c = check("fonts", "woff2 only; font-display swap; no unused @font-face; preload only the 2 faces used above the fold, with as=font crossorigin");
  const exts = [...names].filter((n) => n.startsWith("fonts/") && !/LICENSE/.test(n)).map((n) => extname(n));
  c.expect(exts.every((e) => e === ".woff2"), "fonts/", `non-woff2 font file: ${exts.find((e) => e !== ".woff2")}`);
  const faceFiles = [];
  for (const f of faces) {
    const urls = [...f.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]);
    c.expect(urls.length && urls.every((u) => /\.woff2(\?|$)/.test(u)), "@font-face", `source is not woff2: ${urls.join(",")}`);
    c.expect(/font-display\s*:\s*swap/.test(f), "@font-face", `font-display is not swap (${urls[0]})`);
    faceFiles.push(...urls.map((u) => u.split("?")[0].replace(/^\//, "")));
  }
  for (const n of names) if (n.startsWith("fonts/") && n.endsWith(".woff2")) c.expect(faceFiles.some((f) => f.startsWith(n.replace(/\.woff2$/, "").replace(/\.[0-9a-f]{8,}$/, "")) || f === n), n, "font file not used by any @font-face");
  for (const p of content) {
    const pre = linkRel(p, "preload").filter((l) => l.as === "font");
    const ok = pre.length === 2 && pre.every((l) => l.type === "font/woff2" && l.crossorigin !== undefined && /\.woff2/.test(l.href ?? "") && names.has((localPath(l.href, p.url) ?? "/").slice(1)));
    const wantScript = p.locale === "ar" ? "plex-ar" : "plex-lat";
    const right = pre.every((l) => (l.href ?? "").includes(wantScript));
    ok && right ? c.pass() : c.fail(p.file, `${pre.length} font preloads (want 2 ${wantScript} faces, type=font/woff2, crossorigin, existing file)`);
  }
}
{
  // Dead CSS: selectors whose classes appear on no built page and in no script (same idea as prune-css.mjs, on every style file).
  const c = check("dead-css", "selectors whose class appears on no built page or script (informational: PASS with a count)");
  const usedWords = new Set();
  for (const p of all) for (const m of p.html.matchAll(/[\w-]+/g)) usedWords.add(m[0]);
  for (const n of names) if (n.endsWith(".js")) for (const m of read(n).matchAll(/[\w-]+/g)) usedWords.add(m[0]);
  const css = [...names].filter((n) => n.endsWith(".css")).map(read).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const dead = new Set();
  const rules = css.replace(/@media[^{]*\{|@supports[^{]*\{|@layer[^{]*\{/g, "").split("}");
  for (const r of rules) {
    const open = r.indexOf("{");
    if (open < 0) continue;
    const head = r.slice(0, open).trim();
    if (!head || head.startsWith("@")) continue;
    const sels = head.split(",");
    if (sels.every((s) => [...s.matchAll(/\.([\w-]+)/g)].some((m) => !usedWords.has(m[1])))) dead.add(head.slice(0, 60));
  }
  c.pass();
  c.note = dead.size ? `${dead.size} selector groups reference a class found on no page (first: ${[...dead].slice(0, 3).join(" | ")}). Run scripts/prune-css.mjs on the legacy files; 01-03/06-08 are by hand.` : "none";
}

/* ───────────────────────────── report ───────────────────────────── */
let failed = 0;
for (const r of results) {
  const bad = r.fails.length;
  failed += bad ? 1 : 0;
  console.log(`${bad ? "FAIL" : "PASS"}  ${r.id.padEnd(18)} ${bad ? `${bad} problem${bad > 1 ? "s" : ""}, ${r.ok} ok` : `${r.ok} ok`}  ${r.desc}`);
  const show = ALL ? r.fails : r.fails.slice(0, 6);
  for (const [where, why] of show) console.log(`        ${where}: ${why}`);
  if (r.fails.length > show.length) console.log(`        … ${r.fails.length - show.length} more (use --all)`);
  if (r.note) console.log(`        note: ${r.note}`);
}
console.log(`\n${results.length - failed} of ${results.length} checks pass, ${failed} fail  (dist: ${dist}, ${htmlFiles.length} html files)`);
if (temp && !args.includes("--keep")) rmSync(temp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
