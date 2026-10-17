/**
 * INT-09: the address-checking transport for seller-supplied URLs.
 *
 * Unit tables for the classifier, then real loopback sockets to prove the part
 * a mocked `fetch` can never prove: the address that is connected to is the
 * address that was checked, so a name that resolves to a private address (or
 * that rebinds between two lookups) never reaches the socket.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ecoTrackAdapter } from "../delivery/ecotrack";
import { woocommerceAdapter } from "../ecommerce/woocommerce";
import {
  __setOutboundTestHooks,
  assertPublicOutboundUrl,
  classifyOutboundAddress,
  classifyOutboundHost,
  outboundFetch,
} from "../outbound-http";
import type { OutboundTestHooks } from "../outbound-http";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());

describe("classifyOutboundAddress", () => {
  it.each([
    ["93.184.216.34", null],
    ["8.8.8.8", null],
    ["1.1.1.1", null],
    ["172.15.255.255", null],
    ["172.32.0.1", null],
    ["100.63.255.255", null],
    ["100.128.0.1", null],
    ["2606:4700:4700::1111", null],
    ["2a00:1450:4007:80f::200e", null],
    ["::ffff:8.8.8.8", null],
    ["127.0.0.1", "loopback"],
    ["127.255.255.254", "loopback"],
    ["0.0.0.0", "unspecified"],
    ["0.1.2.3", "unspecified"],
    ["10.0.0.1", "private"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.168.1.1", "private"],
    ["169.254.169.254", "metadata"],
    ["169.254.10.10", "link_local"],
    ["100.100.100.200", "metadata"],
    ["168.63.129.16", "metadata"],
    ["192.0.0.192", "metadata"],
    ["100.64.0.1", "carrier_grade_nat"],
    ["100.127.255.255", "carrier_grade_nat"],
    ["198.18.0.1", "reserved"],
    ["198.19.255.255", "reserved"],
    ["192.0.2.1", "reserved"],
    ["203.0.113.9", "reserved"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.250", "multicast"],
    ["240.0.0.1", "reserved"],
    ["255.255.255.255", "reserved"],
    ["::1", "loopback"],
    ["::", "unspecified"],
    ["fd00:ec2::254", "metadata"],
    ["fc00::1", "private"],
    ["fd12:3456::1", "private"],
    ["fe80::1", "link_local"],
    ["ff02::1", "multicast"],
    ["::ffff:127.0.0.1", "loopback"],
    ["::ffff:7f00:1", "loopback"],
    ["::ffff:10.0.0.1", "private"],
    ["::ffff:169.254.169.254", "metadata"],
    ["::ffff:100.64.0.1", "carrier_grade_nat"],
    ["::10.0.0.1", "reserved"],
    ["64:ff9b::7f00:1", "reserved"],
    ["2002:7f00:1::", "reserved"],
    ["2001:db8::1", "reserved"],
    ["2001:0:4136:e378:8000:63bf:3fff:fdd2", "reserved"],
    ["4000::1", "not_global"],
    ["not-an-ip", "reserved"],
    ["", "reserved"],
  ])("%s -> %s", (address, expected) => {
    expect(classifyOutboundAddress(address)).toBe(expected);
  });
});

describe("classifyOutboundHost / assertPublicOutboundUrl", () => {
  it.each([
    "localhost",
    "LOCALHOST",
    "localhost.",
    "api.localhost",
    "printer.local",
    "nas.home.arpa",
    "metadata.google.internal",
    "intranet",
    "router",
    "0x7f.1",
    "017700000001",
    "",
    "127.0.0.1",
    "[::1]",
    "10.0.0.1",
  ])("treats %j as not public", (host) => {
    expect(classifyOutboundHost(host)).not.toBeNull();
  });

  it.each(["example.com", "shop.example.dz", "api.ecotrack.dz", "93.184.216.34", "[2606:4700:4700::1111]"])(
    "treats %j as public",
    (host) => {
      expect(classifyOutboundHost(host)).toBeNull();
    },
  );

  it("refuses http unless the caller opts in, embedded credentials, and other schemes", () => {
    expect(() => assertPublicOutboundUrl(new URL("https://example.com/x"))).not.toThrow();
    expect(() => assertPublicOutboundUrl(new URL("http://example.com/x"))).toThrow(/not allowed/);
    expect(() =>
      assertPublicOutboundUrl(new URL("http://example.com/x"), { allowHttp: true }),
    ).not.toThrow();
    expect(() => assertPublicOutboundUrl(new URL("https://user:pw@example.com/x"))).toThrow(
      /not allowed/,
    );
    expect(() => assertPublicOutboundUrl(new URL("ftp://example.com/x"))).toThrow(/not allowed/);
  });

  it("normalises obfuscated IPv4 spellings before judging them", () => {
    for (const spelled of ["https://2130706433/", "https://0x7f.1/", "https://017700000001/", "https://127.1/"]) {
      expect(() => assertPublicOutboundUrl(new URL(spelled))).toThrow(/not allowed/);
    }
  });

  it("never puts the URL, host or an address into the error", () => {
    let message = "";
    try {
      assertPublicOutboundUrl(new URL("https://169.254.169.254/latest/meta-data?token=abc"));
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("169.254");
    expect(message).not.toContain("token");
  });
});

describe("outboundFetch over real sockets", () => {
  type Seen = { method: string; url: string; headers: IncomingMessage["headers"]; body: string };
  const seen: Seen[] = [];
  let handler: (req: IncomingMessage, res: ServerResponse) => void = (_req, res) => res.end("{}");
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        seen.push({
          method: req.method ?? "",
          url: req.url ?? "",
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        handler(req, res);
      });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  });

  afterEach(() => {
    __setOutboundTestHooks(null);
    seen.length = 0;
    handler = (_req, res) => res.end("{}");
  });

  type Resolver = NonNullable<OutboundTestHooks["resolve"]>;
  const resolvesTo = (...addresses: string[]) =>
    vi.fn<Resolver>((_host, _options, callback) =>
      callback(
        null,
        addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })),
      ),
    );
  const allowLoopback = (address: string) => address === "127.0.0.1";

  it("refuses a name that resolves to loopback and never opens a connection", async () => {
    const resolver = resolvesTo("127.0.0.1");
    __setOutboundTestHooks({ resolve: resolver });
    await expect(
      outboundFetch(`http://shop.example:${port}/secret`, { allowHttp: true }),
    ).rejects.toMatchObject({ code: "OUTBOUND_URL_BLOCKED" });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(0);
  });

  it("refuses the whole name when only one of its addresses is private", async () => {
    __setOutboundTestHooks({ resolve: resolvesTo("93.184.216.34", "10.0.0.5") });
    await expect(
      outboundFetch(`http://shop.example:${port}/`, { allowHttp: true }),
    ).rejects.toMatchObject({ code: "OUTBOUND_URL_BLOCKED" });
    expect(seen).toHaveLength(0);
  });

  it("refuses a name that resolves to a cloud metadata address", async () => {
    __setOutboundTestHooks({ resolve: resolvesTo("169.254.169.254") });
    await expect(
      outboundFetch(`http://shop.example:${port}/latest/meta-data`, { allowHttp: true }),
    ).rejects.toMatchObject({ code: "OUTBOUND_URL_BLOCKED" });
    expect(seen).toHaveLength(0);
  });

  it("refuses a literal loopback URL before any resolution", async () => {
    const resolver = resolvesTo("127.0.0.1");
    __setOutboundTestHooks({ resolve: resolver, allowAddress: allowLoopback });
    await expect(
      outboundFetch(`http://127.0.0.1:${port}/`, { allowHttp: true }),
    ).rejects.toMatchObject({ code: "OUTBOUND_URL_BLOCKED" });
    expect(resolver).not.toHaveBeenCalled();
    expect(seen).toHaveLength(0);
  });

  it("delivers method, headers and form body to exactly the checked address", async () => {
    __setOutboundTestHooks({ resolve: resolvesTo("127.0.0.1"), allowAddress: allowLoopback });
    handler = (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    };
    const response = await outboundFetch(`http://shop.example:${port}/api/x?a=1`, {
      allowHttp: true,
      method: "POST",
      headers: { Authorization: "Bearer t0ken" },
      body: new URLSearchParams({ api_token: "secret", n: "2" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "POST", url: "/api/x?a=1", body: "api_token=secret&n=2" });
    expect(seen[0]?.headers.authorization).toBe("Bearer t0ken");
    expect(seen[0]?.headers["content-type"]).toContain("application/x-www-form-urlencoded");
    expect(seen[0]?.headers.host).toBe(`shop.example:${port}`);
  });

  it("decodes a gzip response", async () => {
    __setOutboundTestHooks({ resolve: resolvesTo("127.0.0.1"), allowAddress: allowLoopback });
    handler = (_req, res) => {
      res.setHeader("content-encoding", "gzip");
      res.setHeader("content-type", "application/json");
      res.end(gzipSync(JSON.stringify({ packed: "yes" })));
    };
    const response = await outboundFetch(`http://shop.example:${port}/`, { allowHttp: true });
    expect(await response.json()).toEqual({ packed: "yes" });
  });

  it("returns a redirect to the caller instead of following it", async () => {
    __setOutboundTestHooks({ resolve: resolvesTo("127.0.0.1"), allowAddress: allowLoopback });
    handler = (_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", "http://169.254.169.254/latest/meta-data");
      res.end();
    };
    const response = await outboundFetch(`http://shop.example:${port}/start`, { allowHttp: true });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://169.254.169.254/latest/meta-data");
    expect(seen).toHaveLength(1);
  });

  it("stops reading an oversized response", async () => {
    __setOutboundTestHooks({ resolve: resolvesTo("127.0.0.1"), allowAddress: allowLoopback });
    handler = (_req, res) => {
      res.end(Buffer.alloc(8 * 1024 * 1024 + 1024, 1));
    };
    await expect(
      outboundFetch(`http://shop.example:${port}/`, { allowHttp: true }),
    ).rejects.toMatchObject({ code: "OUTBOUND_REQUEST_FAILED" });
  });

  it("honours an abort signal while the server is silent", async () => {
    __setOutboundTestHooks({ resolve: resolvesTo("127.0.0.1"), allowAddress: allowLoopback });
    handler = () => undefined;
    const controller = new AbortController();
    const pending = outboundFetch(`http://shop.example:${port}/`, {
      allowHttp: true,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports a refused connection by code only, without the host or address", async () => {
    const closed = createServer();
    await new Promise<void>((done) => closed.listen(0, "127.0.0.1", done));
    const closedPort = (closed.address() as AddressInfo).port;
    await new Promise<void>((done) => closed.close(() => done()));
    __setOutboundTestHooks({ resolve: resolvesTo("127.0.0.1"), allowAddress: allowLoopback });
    const error = await outboundFetch(`http://secret-shop.example:${closedPort}/`, {
      allowHttp: true,
    }).then(
      () => null,
      (caught: unknown) => caught as Error,
    );
    expect(error).toMatchObject({ code: "OUTBOUND_REQUEST_FAILED" });
    expect(error?.message).toMatch(/ECONNREFUSED/);
    expect(error?.message).not.toContain("secret-shop");
    expect(error?.message).not.toContain("127.0.0.1");
  });
});

describe("the adapters use the connect-time check (INT-09)", () => {
  afterEach(() => {
    __setOutboundTestHooks(null);
  });

  type Resolver = NonNullable<OutboundTestHooks["resolve"]>;
  const resolvesTo = (address: string) =>
    vi.fn<Resolver>((_host, _options, callback) => callback(null, [{ address, family: 4 }]));

  it("EcoTrack: a normal-looking name that resolves to the LAN is refused once, with nothing sent", async () => {
    const resolver = resolvesTo("192.168.1.20");
    __setOutboundTestHooks({ resolve: resolver });
    const result = await ecoTrackAdapter.testConnection({
      carrierName: "Courier",
      apiToken: "token-should-never-leave",
      userGuid: "guid",
      createOrderUrl: "https://merchant.ecotrack.example/create",
      validateOrderUrl: "https://merchant.ecotrack.example/validate",
      trackingsUrl: "https://merchant.ecotrack.example/trackings",
      feesUrl: "https://merchant.ecotrack.example/fees",
    });
    expect(result.ok).toBe(false);
    // Not retried: a refused address is final.
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("192.168.1.20");
    expect(JSON.stringify(result)).not.toContain("token-should-never-leave");
  });

  it("WooCommerce: a name that resolves to loopback is refused and the key is not sent", async () => {
    const resolver = resolvesTo("127.0.0.1");
    __setOutboundTestHooks({ resolve: resolver });
    await expect(
      woocommerceAdapter.listOrdersSince(
        {
          siteUrl: "https://shop.example",
          consumerKey: "ck_should_never_leave",
          consumerSecret: "cs_should_never_leave",
        },
        "",
      ),
    ).rejects.toMatchObject({ code: "OUTBOUND_URL_BLOCKED" });
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});

describe("no seller-URL request can bypass the guard (source pins)", () => {
  const read = (path: string) => readFileSync(resolve(root, path), "utf8");

  function productSources(): string[] {
    const files: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) files.push(path);
      }
    };
    walk(resolve(root, "src"));
    return files;
  }

  it("only tests may call the test-hooks seam", () => {
    const offenders = productSources()
      .map((path) => relative(root, path).replaceAll("\\", "/"))
      .filter((rel) => rel !== "src/lib/integrations/outbound-http.ts")
      .filter((rel) => readFileSync(resolve(root, rel), "utf8").includes("__setOutboundTestHooks"));
    expect(offenders).toEqual([]);
  });

  it("every EcoTrack request goes through ecoFetch and the outbound transport", () => {
    const ecotrack = read("src/lib/integrations/delivery/ecotrack.ts");
    expect(ecotrack.match(/\bretryFetch\(/g)).toHaveLength(1);
    expect(ecotrack).toContain("outboundFetch(input, init)");
    expect(ecotrack).not.toMatch(/(?<![\w.])fetch\(/);
    // pinned by provider-authority-source-contract.test.ts as well
    expect(ecotrack).toContain('parsed.protocol !== "https:"');
    expect(ecotrack).toContain("origins.size !== 1");
  });

  it("WooCommerce never calls the global fetch", () => {
    const woo = read("src/lib/integrations/ecommerce/woocommerce.ts");
    expect(woo).toContain("outboundFetch(");
    expect(woo).not.toMatch(/(?<![\w.])fetch\(/);
  });
});
