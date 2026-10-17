import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { config } from "./proxy";

/**
 * IDN-04: the proxy is the outer door (launch cookie, setup containment,
 * session cookie). Its matcher exempts static image files. That exemption must
 * never cover an API path: `[id]` segments accept any text, so a request such
 * as /api/orders/x.png would otherwise skip the door entirely.
 *
 * The expression is evaluated the way Next evaluates it: anchored, as a
 * path-to-regexp source. It is plain regex syntax with no `:param` tokens.
 */
const source = config.matcher[0] as string;
const matcher = new RegExp(`^${source}$`);

function proxyRuns(pathname: string): boolean {
  return matcher.test(pathname);
}

function walk(directory: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, visit);
    else visit(full);
  }
}

/** URL path of every API route whose LAST segment is dynamic, with that segment replaced. */
function apiRoutesWithDynamicTail(suffix: string): string[] {
  const apiRoot = join(process.cwd(), "src", "app", "api");
  const found: string[] = [];
  walk(apiRoot, (file) => {
    if (!/[\\/]route\.ts$/.test(file)) return;
    const segments = relative(apiRoot, join(file, "..")).split(sep).filter(Boolean);
    const tail = segments[segments.length - 1];
    if (!tail || !/^\[/.test(tail)) return;
    found.push(
      "/api/" + [...segments.slice(0, -1), `probe${suffix}`].join("/"),
    );
  });
  return found;
}

describe("proxy matcher (IDN-04)", () => {
  it("covers a real, non-trivial set of API routes that end in a dynamic segment", () => {
    expect(apiRoutesWithDynamicTail(".png").length).toBeGreaterThan(20);
  });

  it("runs the proxy for every dynamic API route even when the path ends like an image", () => {
    for (const suffix of [".png", ".svg", ".jpg", ".jpeg", ".gif", ".webp", ".ico"]) {
      const exempt = apiRoutesWithDynamicTail(suffix).filter((path) => !proxyRuns(path));
      expect(exempt, `API paths ending ${suffix} that skip the proxy`).toEqual([]);
    }
  });

  it("runs the proxy for API paths in general", () => {
    for (const path of [
      "/api/orders",
      "/api/orders/x.png",
      "/api/customers/abc/avatar.webp",
      "/api/whatsapp/qr-image",
    ]) {
      expect(proxyRuns(path), path).toBe(true);
    }
  });

  it("still serves every committed public image without the proxy", () => {
    const publicRoot = join(process.cwd(), "public");
    expect(existsSync(publicRoot)).toBe(true);
    const images: string[] = [];
    walk(publicRoot, (file) => {
      if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(file)) {
        images.push("/" + relative(publicRoot, file).split(sep).join("/"));
      }
    });
    expect(images.length).toBeGreaterThan(5);
    for (const image of images) {
      expect(proxyRuns(image), image).toBe(false);
    }
  });

  it("keeps the other documented static exemptions", () => {
    for (const path of [
      "/_next/static/media/logo.png",
      "/_next/image",
      "/favicon.ico",
      "/icons/icon-1024.png",
      "/sw.js",
      "/uploads/default/9f1c.webp",
    ]) {
      expect(proxyRuns(path), path).toBe(false);
    }
  });

  it("does not exempt ordinary pages", () => {
    for (const path of ["/", "/login", "/orders", "/orders/abc"]) {
      expect(proxyRuns(path), path).toBe(true);
    }
  });
});
