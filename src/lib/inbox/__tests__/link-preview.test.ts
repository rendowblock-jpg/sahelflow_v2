import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  firstHttpUrlInText,
  getLinkPreview,
  normalizePreviewUrl,
  resetLinkPreviewCacheForTests,
} from "../link-preview";

/**
 * Ledger INB-16 — link previews with SSRF discipline: http(s) only, no
 * credentials, standard ports only, loopback/private/link-local refused on
 * every hop, bounded bodies and an honest null on any failure.
 */

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: location } });
}

const LOOKUP_PUBLIC = async (hostname: string) => {
  if (hostname === "private.example") return { address: "10.0.0.5" };
  if (hostname === "loopback.example") return { address: "127.0.0.1" };
  if (hostname === "linklocal.example") return { address: "169.254.1.9" };
  return { address: "142.250.74.36" };
};

beforeEach(() => resetLinkPreviewCacheForTests());
afterEach(() => vi.restoreAllMocks());

describe("normalizePreviewUrl", () => {
  it("accepts plain public web addresses", () => {
    expect(normalizePreviewUrl("https://example.com/order?ref=1")?.hostname).toBe(
      "example.com",
    );
    expect(normalizePreviewUrl("http://example.com")).not.toBeNull();
  });

  it("refuses non-web schemes, credentials, exotic ports and malformed hosts", () => {
    expect(normalizePreviewUrl("ftp://example.com/file")).toBeNull();
    expect(normalizePreviewUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePreviewUrl("file:///etc/passwd")).toBeNull();
    expect(normalizePreviewUrl("https://user:pass@example.com")).toBeNull();
    expect(normalizePreviewUrl("https://example.com:8443/")).toBeNull();
    expect(normalizePreviewUrl("https://exa%20mple.com/")).toBeNull();
  });

  it("refuses literal loopback, private, link-local and mapped addresses", () => {
    expect(normalizePreviewUrl("http://127.0.0.1/")).toBeNull();
    expect(normalizePreviewUrl("http://10.1.2.3/")).toBeNull();
    expect(normalizePreviewUrl("http://192.168.1.4/")).toBeNull();
    expect(normalizePreviewUrl("http://172.16.0.9/")).toBeNull();
    expect(normalizePreviewUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
    expect(normalizePreviewUrl("http://[::1]/")).toBeNull();
    expect(normalizePreviewUrl("http://[::ffff:10.0.0.1]/")).toBeNull();
    expect(normalizePreviewUrl("http://0.0.0.0/")).toBeNull();
  });
});

describe("firstHttpUrlInText", () => {
  it("finds the first URL and strips trailing punctuation", () => {
    expect(firstHttpUrlInText("see https://example.com/a, ok?")).toBe(
      "https://example.com/a",
    );
    expect(firstHttpUrlInText("check http://shop.dz)).")).toBe(
      "http://shop.dz",
    );
    expect(firstHttpUrlInText("no link here")).toBeNull();
    expect(firstHttpUrlInText("ftp://not.a.web.scheme")).toBeNull();
  });
});

describe("getLinkPreview", () => {
  it("returns null for a non-web or private target without any fetch", async () => {
    const fetchHtml = vi.fn();
    expect(await getLinkPreview("javascript:alert(1)", { fetchHtml })).toBeNull();
    expect(await getLinkPreview("http://192.168.0.1/", { fetchHtml })).toBeNull();
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it("refuses hostnames that resolve into private ranges", async () => {
    const fetchHtml = vi.fn();
    const preview = await getLinkPreview("https://private.example/x", {
      fetchHtml,
      lookup: LOOKUP_PUBLIC,
    });
    expect(preview).toBeNull();
    expect(fetchHtml).not.toHaveBeenCalled();
  });

  it("extracts OpenGraph metadata from a bounded HTML body", async () => {
    const fetchHtml = vi.fn(async () =>
      htmlResponse(
        `<html><head>
          <meta property="og:site_name" content="AnnonceDZ" />
          <meta property="og:title" content="iPhone 14 neuf" />
          <meta property="og:description" content="Livraison 58 wilayas" />
        </head><body>hello</body></html>`,
      ),
    );
    const preview = await getLinkPreview("https://shop.example/annonce/1", {
      fetchHtml,
      lookup: LOOKUP_PUBLIC,
    });
    expect(preview).toMatchObject({
      domain: "shop.example",
      title: "iPhone 14 neuf",
      description: "Livraison 58 wilayas",
      siteName: "AnnonceDZ",
    });
    expect(fetchHtml).toHaveBeenCalledTimes(1);
  });

  it("follows redirects only through re-validated public hosts", async () => {
    const fetchHtml = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse("https://shop.example/final"))
      .mockResolvedValueOnce(
        htmlResponse('<meta property="og:title" content="Arrived" />'),
      );
    const preview = await getLinkPreview("https://a.example/1", {
      fetchHtml,
      lookup: LOOKUP_PUBLIC,
    });
    expect(preview?.title).toBe("Arrived");
    expect(fetchHtml).toHaveBeenCalledTimes(2);

    // A redirect into a private range is refused outright.
    const blockedFetch = vi
      .fn()
      .mockResolvedValue(redirectResponse("http://192.168.0.10/steal"));
    expect(
      await getLinkPreview("https://evil.example/redirect", {
        fetchHtml: blockedFetch,
        lookup: LOOKUP_PUBLIC,
      }),
    ).toBeNull();
  });

  it("caches results so repeat renders never re-fetch", async () => {
    const fetchHtml = vi.fn(async () =>
      htmlResponse('<meta property="og:title" content="Cached" />'),
    );
    const first = await getLinkPreview("https://cache.example/a", {
      fetchHtml,
      lookup: LOOKUP_PUBLIC,
    });
    const second = await getLinkPreview("https://cache.example/a", {
      fetchHtml,
      lookup: LOOKUP_PUBLIC,
    });
    expect(first?.title).toBe("Cached");
    expect(second?.title).toBe("Cached");
    expect(fetchHtml).toHaveBeenCalledTimes(1);
  });

  it("answers null (never throws) when the fetch fails or the body is empty", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(
      await getLinkPreview("https://offline.example/", {
        fetchHtml: failing,
        lookup: LOOKUP_PUBLIC,
      }),
    ).toBeNull();
    const empty = vi.fn(async () => htmlResponse("<html><body></body></html>"));
    expect(
      await getLinkPreview("https://empty.example/", {
        fetchHtml: empty,
        lookup: LOOKUP_PUBLIC,
      }),
    ).toBeNull();
  });
});
