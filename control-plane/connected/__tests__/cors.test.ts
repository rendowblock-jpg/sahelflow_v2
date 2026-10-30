import { describe, expect, it } from "vitest";
import {
  CORS_ALLOWED_HEADERS,
  CORS_ALLOWED_METHODS,
  CORS_MAX_AGE_SECONDS,
  allowedOrigin,
  corsHeaders,
  parseAllowedOrigins,
} from "../cors";

const ORIGINS = parseAllowedOrigins("https://app.sahelflow.example, http://localhost:4420,https://pwa.example:8443");

describe("parseAllowedOrigins", () => {
  it("keeps exact scheme+host+port origins and trims blanks", () => {
    expect([...ORIGINS].sort()).toEqual([
      "http://localhost:4420",
      "https://app.sahelflow.example",
      "https://pwa.example:8443",
    ]);
  });

  it.each([
    ["wildcard", "*"],
    ["wildcard subdomain", "https://*.sahelflow.example"],
    ["the string null", "null"],
    ["a trailing slash", "https://app.sahelflow.example/"],
    ["a path", "https://app.sahelflow.example/pwa"],
    ["a query", "https://app.sahelflow.example?x=1"],
    ["credentials", "https://user:pw@app.sahelflow.example"],
    ["a default port written out", "https://app.sahelflow.example:443"],
    ["an uppercase host", "https://APP.sahelflow.example"],
    ["plain http on a real host", "http://app.sahelflow.example"],
    ["another scheme", "ftp://app.sahelflow.example"],
    ["a bare host", "app.sahelflow.example"],
    ["garbage", "%%%"],
  ])("drops %s", (_label, entry) => {
    expect(parseAllowedOrigins(entry).size).toBe(0);
  });

  it("allows plain http only for loopback hosts", () => {
    expect(parseAllowedOrigins("http://127.0.0.1:3000,http://[::1]:3000,http://localhost").size).toBe(3);
  });

  it("is empty for an unset or blank variable", () => {
    expect(parseAllowedOrigins(undefined).size).toBe(0);
    expect(parseAllowedOrigins("").size).toBe(0);
    expect(parseAllowedOrigins(" , ,").size).toBe(0);
  });
});

describe("allowedOrigin", () => {
  it("returns the origin only on an exact match", () => {
    expect(allowedOrigin("https://app.sahelflow.example", ORIGINS)).toBe("https://app.sahelflow.example");
    expect(allowedOrigin("http://localhost:4420", ORIGINS)).toBe("http://localhost:4420");
  });

  it.each([
    ["no header", null],
    ["empty", ""],
    ["the null origin", "null"],
    ["another host", "https://evil.example"],
    ["a suffix attack", "https://app.sahelflow.example.evil.example"],
    ["a prefix attack", "https://evil-app.sahelflow.example"],
    ["another port", "http://localhost:4421"],
    ["another scheme", "http://app.sahelflow.example"],
    ["a trailing slash", "https://app.sahelflow.example/"],
    ["different case", "https://App.sahelflow.example"],
    ["surrounding space", " https://app.sahelflow.example"],
    ["a wildcard", "*"],
  ])("refuses %s", (_label, origin) => {
    expect(allowedOrigin(origin, ORIGINS)).toBeNull();
  });

  it("refuses everything when the list is empty", () => {
    expect(allowedOrigin("https://app.sahelflow.example", new Set())).toBeNull();
  });
});

describe("corsHeaders", () => {
  it("answers a normal request with the origin and what the page may read", () => {
    const headers = corsHeaders("https://app.sahelflow.example", false);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.sahelflow.example");
    expect(headers["Access-Control-Expose-Headers"]).toContain("Retry-After");
    expect(headers["Access-Control-Allow-Methods"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Credentials"]).toBeUndefined();
  });

  it("adds methods, headers and a one day max age on a preflight, nothing wider", () => {
    const headers = corsHeaders("https://app.sahelflow.example", true);
    expect(headers["Access-Control-Allow-Methods"]).toBe(CORS_ALLOWED_METHODS);
    expect(headers["Access-Control-Allow-Headers"]).toBe(CORS_ALLOWED_HEADERS);
    expect(headers["Access-Control-Max-Age"]).toBe("86400");
    expect(CORS_MAX_AGE_SECONDS).toBe(86400);
    expect(CORS_ALLOWED_METHODS).toBe("GET, POST, OPTIONS");
    expect(CORS_ALLOWED_HEADERS).toBe("Authorization, Content-Type");
    expect(Object.values(headers)).not.toContain("*");
  });
});
