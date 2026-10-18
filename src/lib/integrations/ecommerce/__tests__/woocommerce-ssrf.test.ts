/**
 * INT-09: the WooCommerce site URL is typed in by the seller. The previous
 * guard blocked only a short list of literal addresses, so carrier-grade-NAT
 * (100.64/10, which holds the Alibaba metadata address), benchmarking,
 * multicast, NAT64/6to4 embeddings, trailing-dot `localhost.`, `.local` /
 * `.internal` names and single-label LAN names all went through, and the
 * consumer key and secret were sent to them as Basic auth.
 *
 * Only the global `fetch` stub is used: a blocked site must never reach the
 * network layer, whatever transport sits behind it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { woocommerceAdapter } from "../woocommerce";
import type { WooCommerceCredentials } from "../types";

const mockFetch = vi.fn();

const creds: WooCommerceCredentials = {
  siteUrl: "https://example.com",
  consumerKey: "ck_should_never_leave",
  consumerSecret: "cs_should_never_leave",
};

const BLOCKED_SITES = [
  "http://100.64.0.1",
  "http://100.100.100.200",
  "http://198.18.0.1",
  "http://0.0.0.0",
  "http://224.0.0.1",
  "http://255.255.255.255",
  "http://192.0.0.192",
  "http://168.63.129.16",
  "http://[::]",
  "http://[ff02::1]",
  "http://[64:ff9b::7f00:1]",
  "http://[2002:7f00:1::]",
  "http://[::ffff:100.64.0.1]",
  "http://[fd00:ec2::254]",
  "http://localhost.",
  "http://LOCALHOST",
  "http://shop.localhost",
  "http://printer.local",
  "http://metadata.google.internal",
  "http://intranet",
  "http://2130706433",
  "http://0x7f.1",
] as const;

describe("WooCommerce refuses site URLs that point inside the machine or the LAN (INT-09)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(BLOCKED_SITES)("%s: no request and no credential leave the process", async (siteUrl) => {
    await expect(
      woocommerceAdapter.listOrdersSince({ ...creds, siteUrl }, ""),
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not put the blocked address or the consumer secret into the error", async () => {
    const error = await woocommerceAdapter
      .listOrdersSince({ ...creds, siteUrl: "http://100.100.100.200" }, "")
      .then(
        () => null,
        (caught: unknown) => caught as Error,
      );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message ?? "").not.toContain("100.100.100.200");
    expect(error?.message ?? "").not.toContain("cs_should_never_leave");
  });
});
