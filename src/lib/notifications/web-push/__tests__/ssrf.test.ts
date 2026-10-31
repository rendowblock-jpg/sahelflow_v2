import { describe, expect, it } from "vitest";

import { MAX_ENDPOINT_LENGTH, PushEndpointError, assertPushEndpoint, isAllowedPushEndpoint } from "../ssrf";

const HOSTILE: Array<[string, string]> = [
  ["plain http", "http://fcm.googleapis.com/fcm/send/x"],
  ["ftp", "ftp://fcm.googleapis.com/x"],
  ["javascript", "javascript:alert(1)"],
  ["file", "file:///etc/passwd"],
  ["data", "data:text/plain,hi"],
  ["scheme relative", "//fcm.googleapis.com/x"],
  ["empty", ""],
  ["not a url", "not a url"],
  ["no scheme", "fcm.googleapis.com/fcm/send/x"],
  ["allowed name used as a prefix", "https://fcm.googleapis.com.evil.example/x"],
  ["glued prefix, no dot", "https://evilfcm.googleapis.com/x"],
  ["glued windows prefix", "https://evilnotify.windows.com/x"],
  ["windows bare domain", "https://notify.windows.com/x"],
  ["mozilla as a prefix", "https://updates.push.services.mozilla.com.evil.example/x"],
  ["mozilla sibling", "https://push.services.mozilla.com/x"],
  ["mozilla subdomain", "https://evil.updates.push.services.mozilla.com/x"],
  ["apple subdomain", "https://evil.web.push.apple.com/x"],
  ["apple as a prefix", "https://web.push.apple.com.evil.example/x"],
  ["apple glued", "https://evilweb.push.apple.com/x"],
  ["google bare", "https://googleapis.com/x"],
  ["fcm other tld", "https://fcm.googleapis.org/x"],
  ["userinfo before allowed host", "https://evil.example@fcm.googleapis.com/x"],
  ["userinfo hiding the real host", "https://fcm.googleapis.com@evil.example/x"],
  ["user and password", "https://user:pass@fcm.googleapis.com/x"],
  ["port looking like userinfo", "https://fcm.googleapis.com:443@evil.example/x"],
  ["port 8443", "https://fcm.googleapis.com:8443/x"],
  ["port 80", "https://fcm.googleapis.com:80/x"],
  ["port 0", "https://fcm.googleapis.com:0/x"],
  ["port 65535", "https://fcm.googleapis.com:65535/x"],
  ["ipv4 loopback", "https://127.0.0.1/x"],
  ["ipv4 loopback over http", "http://127.0.0.1/x"],
  ["ipv4 10/8", "https://10.0.0.5/x"],
  ["ipv4 192.168/16", "https://192.168.1.1/x"],
  ["ipv4 link-local metadata", "https://169.254.169.254/latest/meta-data/"],
  ["ipv4 unspecified", "https://0.0.0.0/x"],
  ["ipv4 as one integer", "https://2130706433/x"],
  ["ipv4 hex", "https://0x7f.0.0.1/x"],
  ["ipv4 octal", "https://0177.0.0.1/x"],
  ["ipv6 loopback", "https://[::1]/x"],
  ["ipv6 mapped ipv4", "https://[::ffff:127.0.0.1]/x"],
  ["ipv6 documentation", "https://[2001:db8::1]/x"],
  ["localhost", "https://localhost/x"],
  ["localhost with dot", "https://localhost./x"],
  ["single label internal name", "https://intranet/x"],
  ["mdns name", "https://printer.local/x"],
  ["trailing dot", "https://fcm.googleapis.com./fcm/send/x"],
  ["trailing dot apple", "https://web.push.apple.com./x"],
  ["punycode look-alike", "https://xn--e1afmkfd.example/x"],
  ["punycode label under an allowed suffix", "https://xn--e1afmkfd.fcm.googleapis.com/x"],
  ["cyrillic o in google", "https://fcm.g\u043e\u043egleapis.com/x"],
  ["ideographic full stop", "https://fcm\u3002googleapis\u3002com/x"],
  ["fullwidth letter", "https://\uff46cm.googleapis.com/x"],
  ["backslash userinfo trick", "https://fcm.googleapis.com\\@evil.example/x"],
  ["backslash before allowed suffix", "https://evil.example\\.fcm.googleapis.com/x"],
  ["space in host", "https://fcm.googleapis.com /x"],
  ["leading space", " https://fcm.googleapis.com/x"],
  ["trailing newline", "https://fcm.googleapis.com/x\n"],
  ["tab inside host", "https://fcm.googleapis.\tcom/x"],
  ["nul byte", "https://fcm.googleapis.com\u0000.evil.example/x"],
  ["percent encoded dot in host", "https://fcm%2egoogleapis.com/x"],
  ["fragment trick", "https://fcm.googleapis.com#@evil.example/x"],
  ["plain fragment", "https://fcm.googleapis.com/x#frag"],
  ["too long", "https://fcm.googleapis.com/" + "a".repeat(2100)],
];

const GOOD = [
  "https://fcm.googleapis.com/fcm/send/TEST-ONLY-1",
  "https://fcm.googleapis.com/wp/TEST-ONLY-2",
  "https://eu.fcm.googleapis.com/fcm/send/TEST-ONLY-3",
  "https://a.b.fcm.googleapis.com/x",
  "https://updates.push.services.mozilla.com/wpush/v2/TEST-ONLY-4",
  "https://web.push.apple.com/TEST-ONLY-5",
  "https://push.apple.com/TEST-ONLY-6",
  "https://db5p.notify.windows.com/?token=TEST-ONLY-7",
  "https://wns2-par02p.notify.windows.com/w/?token=TEST%2BONLY%3D",
  "HTTPS://FCM.GoogleAPIs.COM/fcm/send/TEST-ONLY-8",
  "https://fcm.googleapis.com:443/fcm/send/TEST-ONLY-9",
  "https://fcm.googleapis.com/" + "a".repeat(MAX_ENDPOINT_LENGTH - "https://fcm.googleapis.com/".length),
];

const CODES = new Set([
  "not_string", "too_long", "bad_chars", "bad_url", "not_https", "credentials", "port",
  "fragment", "bad_host", "trailing_dot", "ip_literal", "punycode", "host_not_allowed",
]);

function codeOf(url: unknown): string {
  try {
    assertPushEndpoint(url as string);
  } catch (error) {
    return error instanceof PushEndpointError ? error.code : "other:" + String(error);
  }
  return "no-throw";
}

describe("assertPushEndpoint: hostile addresses", () => {
  it("has at least 30 hostile and 10 good cases", () => {
    expect(HOSTILE.length).toBeGreaterThanOrEqual(30);
    expect(GOOD.length).toBeGreaterThanOrEqual(10);
  });

  it.each(HOSTILE)("refuses %s", (_label, url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false);
    const code = codeOf(url);
    expect(CODES.has(code)).toBe(true);
    try {
      assertPushEndpoint(url);
    } catch (error) {
      // The message is fixed text: it must never echo the address.
      expect(String((error as Error).message)).not.toContain("evil");
      expect(String((error as Error).message)).not.toContain("127.0.0.1");
    }
  });

  it("refuses values that are not strings", () => {
    for (const value of [undefined, null, 5, {}, ["https://fcm.googleapis.com/x"]]) {
      expect(codeOf(value)).toBe("not_string");
    }
  });

  it("names the reason for the main attack families", () => {
    expect(codeOf("http://fcm.googleapis.com/x")).toBe("not_https");
    expect(codeOf("https://u:p@fcm.googleapis.com/x")).toBe("credentials");
    expect(codeOf("https://fcm.googleapis.com@evil.example/x")).toBe("credentials");
    expect(codeOf("https://fcm.googleapis.com:8443/x")).toBe("port");
    expect(codeOf("https://127.0.0.1/x")).toBe("ip_literal");
    expect(codeOf("https://[::1]/x")).toBe("ip_literal");
    expect(codeOf("https://2130706433/x")).toBe("ip_literal");
    expect(codeOf("https://fcm.googleapis.com./x")).toBe("trailing_dot");
    expect(codeOf("https://xn--e1afmkfd.example/x")).toBe("punycode");
    expect(codeOf("https://fcm.googleapis.com.evil.example/x")).toBe("host_not_allowed");
    expect(codeOf("https://evilfcm.googleapis.com/x")).toBe("host_not_allowed");
    expect(codeOf("https://localhost/x")).toBe("host_not_allowed");
    expect(codeOf("https://fcm.googleapis.com/x#a")).toBe("fragment");
    expect(codeOf("https://fcm\u3002googleapis\u3002com/x")).toBe("bad_chars");
  });

  it("accepts exactly 2048 characters and refuses 2049", () => {
    const prefix = "https://fcm.googleapis.com/";
    expect(isAllowedPushEndpoint(prefix + "a".repeat(2048 - prefix.length))).toBe(true);
    expect(codeOf(prefix + "a".repeat(2049 - prefix.length))).toBe("too_long");
  });
});

describe("assertPushEndpoint: real push service shapes", () => {
  it.each(GOOD.map((u) => [u.length > 80 ? u.slice(0, 60) + "..." : u, u]))("accepts %s", (_label, url) => {
    expect(isAllowedPushEndpoint(url as string)).toBe(true);
    const parsed = assertPushEndpoint(url as string);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).toBe(parsed.hostname.toLowerCase());
  });
});
