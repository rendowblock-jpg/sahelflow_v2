import { describe, expect, it } from "vitest";
import { cacheNameFor, cachesToDelete, routeRequest, type RouteInput } from "../src/sw/strategy";

const O = "https://app.example";
const PRE = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/assets/app.1a2b3c4d.js", "/assets/app.1a2b3c4d.css"];
type Row = readonly [string, string, Partial<RouteInput>, string];
const rows: readonly Row[] = [
  ["hashed js in the precache list", `${O}/assets/app.1a2b3c4d.js`, {}, "cache-first"],
  ["hashed css with a query", `${O}/assets/app.1a2b3c4d.css?x=1`, {}, "cache-first"],
  ["hashed font not yet in the list", `${O}/assets/plex-ar-400.9f8e7d6c.woff2`, {}, "cache-first"],
  ["navigation to /", `${O}/`, { mode: "navigate" }, "navigate"],
  ["navigation with a query", `${O}/?screen=today`, { mode: "navigate" }, "navigate"],
  ["navigation to a deep path", `${O}/queue`, { mode: "navigate" }, "navigate"],
  ["same-origin /v1 navigation is never intercepted", `${O}/v1/projections`, { mode: "navigate" }, "bypass"],
  ["relay GET on another origin", "https://connect.sahelflow.com/v1/projections", {}, "bypass"],
  ["navigation to a foreign site", "https://evil.example/", { mode: "navigate" }, "bypass"],
  ["POST to the relay path", `${O}/v1/pairings/exchange`, { method: "POST" }, "bypass"],
  ["POST to /", `${O}/`, { method: "POST", mode: "navigate" }, "bypass"],
  ["HEAD", `${O}/assets/app.1a2b3c4d.js`, { method: "HEAD" }, "bypass"],
  ["the service worker file itself", `${O}/sw.js`, {}, "bypass"],
  ["manifest (precached, not hashed)", `${O}/manifest.webmanifest`, {}, "network-first"],
  ["icon (precached, not hashed)", `${O}/icons/icon-192.png`, {}, "network-first"],
  ["unknown same-origin json", `${O}/random.json`, {}, "bypass"],
  ["path tricks that land on /v1", `${O}/assets/../v1/projections`, {}, "bypass"],
  ["garbage url", "::::", {}, "bypass"],
  ["other port", "https://app.example:8443/assets/app.1a2b3c4d.js", {}, "bypass"],
  ["other scheme", "http://app.example/assets/app.1a2b3c4d.js", {}, "bypass"],
  ["hashed-looking name outside /assets/", `${O}/other/app.1a2b3c4d.js`, {}, "bypass"],
];

describe("routeRequest", () => {
  it.each(rows)("%s", (_name, url, over, want) => {
    const input: RouteInput = { url, method: "GET", mode: "no-cors", origin: O, precache: PRE, ...over };
    expect(routeRequest(input)).toBe(want);
  });
});

describe("cache names", () => {
  it("are versioned and old ones are cleaned, foreign ones kept", () => {
    expect(cacheNameFor("abc123")).toBe("sfapp-vabc123");
    const existing = ["sfapp-vold", "sfapp-vabc123", "other-cache", "sfapp-v"];
    expect(cachesToDelete(existing, "abc123")).toEqual(["sfapp-vold", "sfapp-v"]);
    expect(cachesToDelete([], "x")).toEqual([]);
  });
});
