// Hostile reviewer, check b: the BUILT PWA. _headers is parsed like Cloudflare Pages reads it (rules merge, `*` is a splat).
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPwa } from "../build.mjs";

let dir = "";
const read = (p: string): string => readFileSync(join(dir, p), "utf8");
beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), "sfsec-")); await buildPwa({ outDir: dir }); }, 60_000);

function resolveHeaders(path: string): Record<string, string> {
  const merged: Record<string, string> = {};
  let pattern = ""; let hit = false;
  for (const line of read("_headers").split("\n")) {
    if (!line.trim()) continue;
    if (!line.startsWith(" ")) {
      pattern = line.trim();
      hit = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(path);
    } else if (hit) {
      const at = line.indexOf(":");
      const name = line.slice(0, at).trim(); const value = line.slice(at + 1).trim();
      merged[name] = merged[name] ? `${merged[name]}, ${value}` : value;
    }
  }
  return merged;
}
const csp = (path = "/"): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  for (const part of (resolveHeaders(path)["Content-Security-Policy"] ?? "").split(";")) {
    const [name = "", ...values] = part.trim().split(/\s+/);
    if (name) out.set(name, values);
  }
  return out;
};

describe("built CSP", () => {
  it("pins every directive; only 'self' runs scripts and styles", () => {
    const p = csp();
    expect(Object.fromEntries(p)).toEqual({
      "default-src": ["'self'"], "script-src": ["'self'"], "style-src": ["'self'"], "font-src": ["'self'"],
      "img-src": ["'self'", "data:"], "connect-src": ["'self'", "https://connect.sahelflow.com"],
      "manifest-src": ["'self'"], "worker-src": ["'self'"], "base-uri": ["'none'"], "form-action": ["'none'"],
      "object-src": ["'none'"], "frame-ancestors": ["'none'"],
    });
    expect(resolveHeaders("/")["Content-Security-Policy"]).not.toMatch(/unsafe-|\*|blob:|http:|strict-dynamic/);
    expect(csp("/assets/app.12345678.js")).toEqual(p);
  });
  it("every path gets the same hardening headers", () => {
    for (const path of ["/", "/index.html", "/sw.js", "/offline.html", "/assets/app.12345678.js", "/icons/icon-192.png"]) {
      const h = resolveHeaders(path);
      expect(h["Referrer-Policy"], path).toBe("no-referrer");
      expect(h["X-Content-Type-Options"], path).toBe("nosniff");
      expect(h["Permissions-Policy"], path).toBe("camera=(), microphone=(), geolocation=(), payment=()");
    }
  });
});

describe("built cache rules", () => {
  it("hashed assets are immutable for a year", () => {
    expect(resolveHeaders("/assets/app.12345678.js")["Cache-Control"]).toBe("public, max-age=31536000, immutable");
  });
  it("the shell is revalidated on every path it can be reached by", () => {
    for (const path of ["/", "/index.html", "/sw.js", "/offline.html", "/manifest.webmanifest", "/asset-manifest.json"]) {
      expect(resolveHeaders(path)["Cache-Control"], path).toBe("no-cache");
    }
  });
  it("every file in assets/ is named by the hash of its own bytes (so immutable is safe) and has no source map", () => {
    const files = readdirSync(join(dir, "assets"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const m = /^[\w.-]+\.([0-9a-f]{8})\.(js|css|woff2)$/.exec(file);
      expect(m, file).toBeTruthy();
      expect(createHash("sha256").update(readFileSync(join(dir, "assets", file))).digest("hex").slice(0, 8), file).toBe(m?.[1]);
    }
    for (const file of [...files.map((f) => `assets/${f}`), "sw.js"]) {
      if (file.endsWith(".woff2")) continue;
      expect(read(file), file).not.toContain("sourceMappingURL");
    }
  });
});

describe("built pages and scripts", () => {
  it("index and offline carry no inline script, handler, style attribute or javascript: link", () => {
    for (const page of ["index.html", "offline.html"]) {
      const html = read(page);
      for (const tag of html.match(/<script\b[^>]*>/g) ?? []) expect(tag, page).toMatch(/\ssrc="\/assets\/[^"]+"/);
      expect(html.replace(/<script\b[^>]*><\/script>/g, ""), page).not.toMatch(/<script\b/i);
      expect(html, page).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html, page).not.toMatch(/\sstyle\s*=/i);
      expect(html, page).not.toMatch(/javascript:/i);
      expect(html, page).toContain('<meta name="referrer" content="no-referrer">');
    }
  });
  it("no built script calls eval or new Function (script-src would block them)", () => {
    const js = readdirSync(join(dir, "assets")).filter((f) => f.endsWith(".js")).map((f) => `assets/${f}`);
    for (const file of [...js, "sw.js"]) expect(read(file), file).not.toMatch(/(^|[^\w.$])eval\(|new Function\(/);
  });
});
