// Shared by site-check, site-browser-check and the local server: walking dist, reading _headers / _redirects, CSP parsing.
import { createServer } from "node:http";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

export const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
export const rel = (dir, file) => file.slice(dir.length + 1).split(sep).join("/");
export const sha256 = (s) => createHash("sha256").update(s).digest("base64");
export const gz = (buf) => gzipSync(buf, { level: 9 }).length;

/** Cloudflare `_headers`: a path pattern at column 0, indented `Name: value` lines under it. */
export function parseHeaders(text) {
  const rules = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (/^\s/.test(raw)) {
      const i = raw.indexOf(":");
      if (cur && i > 0) cur.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    } else {
      cur = { pattern: raw.trim(), headers: [] };
      rules.push(cur);
    }
  }
  return rules;
}
const patternRe = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "(.*)").replace(/:([A-Za-z]\w*)/g, "([^/]+)")}$`);
/** Headers a request path receives; same name in several rules is joined with ", " like Cloudflare does. */
export function headersFor(rules, path) {
  const out = {};
  for (const r of rules) {
    if (!patternRe(r.pattern).test(path)) continue;
    for (const [k, v] of r.headers) out[k.toLowerCase()] = out[k.toLowerCase()] ? `${out[k.toLowerCase()]}, ${v}` : v;
  }
  return out;
}
export function parseRedirects(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    const [from, to, status] = l.split(/\s+/);
    return { from, to, status: Number(status ?? 302) };
  });
}

export const KNOWN_DIRECTIVES = new Set(["default-src", "script-src", "script-src-elem", "script-src-attr", "style-src", "style-src-elem", "style-src-attr", "img-src", "font-src", "connect-src", "media-src", "object-src", "frame-src", "child-src", "worker-src", "manifest-src", "prefetch-src", "base-uri", "form-action", "frame-ancestors", "sandbox", "report-uri", "report-to", "upgrade-insecure-requests", "block-all-mixed-content", "require-trusted-types-for", "trusted-types"]);
export function parseCsp(csp) {
  const dirs = new Map();
  const dup = [];
  for (const part of csp.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [name, ...vals] = part.split(/\s+/);
    if (dirs.has(name.toLowerCase())) dup.push(name);
    dirs.set(name.toLowerCase(), vals);
  }
  return { dirs, dup };
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".ico": "image/x-icon" };
export const mimeOf = (p) => MIME[extname(p)] ?? "application/octet-stream";

/**
 * A tiny static server that behaves like the Cloudflare Worker with static assets for this site:
 * serves `_headers` and `_redirects`, `/dir/` -> dir/index.html, 404.html with status 404, `/get/windows` -> 302.
 * Never reaches the network. Returns { url, close, requests }.
 */
export function startServer(dist, port = 0) {
  const rules = parseHeaders(existsSync(join(dist, "_headers")) ? readFileSync(join(dist, "_headers"), "utf8") : "");
  const redirects = parseRedirects(existsSync(join(dist, "_redirects")) ? readFileSync(join(dist, "_redirects"), "utf8") : "");
  const log = [];
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let p = decodeURIComponent(u.pathname);
    log.push(p);
    const send = (status, body, extra = {}, path = p) => {
      const h = { ...headersFor(rules, path), ...extra };
      res.writeHead(status, h);
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (p === "/get/windows" || p === "/get/windows/") return send(302, "", { location: "https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest" });
    const rd = redirects.find((r) => r.from === p);
    if (rd) return send(rd.status, "", { location: rd.to });
    let file = normalize(join(dist, p));
    if (!file.startsWith(dist)) return send(403, "");
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!p.endsWith("/")) return send(307, "", { location: `${p}/${u.search}` });
      file = join(file, "index.html");
    }
    if (existsSync(file) && statSync(file).isFile()) return send(200, readFileSync(file), { "content-type": mimeOf(file) });
    const nf = join(dist, "404.html");
    return send(404, existsSync(nf) ? readFileSync(nf) : "not found", { "content-type": "text/html; charset=utf-8" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)), requests: log })));
}
