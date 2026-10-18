import "server-only";

import { lookup as dnsLookup } from "node:dns";
import type { LookupAddress, LookupOptions } from "node:dns";
import { request as httpRequest } from "node:http";
import type { ClientRequest, IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import type { Readable, Transform } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { SahelFlowError } from "@/types/errors";

/**
 * Outbound HTTP for URLs a seller typed in (INT-09).
 *
 * A seller-supplied URL must never make the desktop talk to itself, to the LAN
 * or to a cloud metadata service, and must never carry a courier or shop
 * credential there. Three layers, all fail-closed:
 *
 * 1. `assertPublicOutboundUrl` rejects what is visible in the URL itself:
 *    scheme, embedded credentials, literal addresses, and names that can only
 *    resolve locally (`localhost`, `*.local`, `*.internal`, single-label names,
 *    non-canonical numeric hosts).
 * 2. The connection is made by `node:http(s)` with a `lookup` function that
 *    resolves the name, classifies EVERY returned address, and hands only
 *    checked addresses to the socket. The address that is connected to is
 *    therefore the address that was checked: there is no second resolution a
 *    rebinding DNS server could answer differently (global `fetch` cannot give
 *    this guarantee, which is why it is not used here).
 * 3. Redirects are never followed. A 3xx response is returned to the caller,
 *    which decides (and must pass any target back through this module).
 *
 * Policy: no provider needs loopback, link-local, RFC1918, carrier-grade NAT or
 * metadata addresses, so none is allowed. In particular a WooCommerce store that
 * is reachable only on the seller's own LAN is not supported (literal LAN
 * addresses were already refused before this module existed; a name that merely
 * resolves to one is now refused as well). Revisit per provider, never globally.
 *
 * Errors raised here never contain the URL, the host, an address, a header or
 * a body: only a fixed message and a short machine code.
 */

export type OutboundBlockReason =
  | "unspecified"
  | "loopback"
  | "private"
  | "link_local"
  | "carrier_grade_nat"
  | "metadata"
  | "reserved"
  | "multicast"
  | "not_global";

export type OutboundBlockedReason = OutboundBlockReason | "hostname" | "scheme" | "credentials";

/** The URL or the address it resolves to is not a public internet host. */
export class OutboundBlockedError extends SahelFlowError {
  readonly nonRetryable = true;

  constructor(readonly reason: OutboundBlockedReason) {
    super(
      "This address is not allowed: the server must be a public internet host.",
      "OUTBOUND_URL_BLOCKED",
      400,
    );
  }
}

/** The request could not be completed; `code` is a short network/TLS code only. */
export class OutboundRequestError extends SahelFlowError {
  constructor(code: string) {
    const safe = /^[A-Z][A-Z0-9_]{1,47}$/.test(code) ? code : "UNKNOWN";
    super(`Could not reach the remote server (${safe}).`, "OUTBOUND_REQUEST_FAILED", 502);
  }
}

type Family = "ipv4" | "ipv6";
type RangeSpec = readonly [OutboundBlockReason, string, number, Family];

// Order matters: the first match names the reason, so specific entries
// (metadata services) come before the wider range that contains them.
const RANGES: readonly RangeSpec[] = [
  ["metadata", "169.254.169.254", 32, "ipv4"],
  ["metadata", "100.100.100.200", 32, "ipv4"],
  ["metadata", "168.63.129.16", 32, "ipv4"],
  ["metadata", "192.0.0.192", 32, "ipv4"],
  ["unspecified", "0.0.0.0", 8, "ipv4"],
  ["private", "10.0.0.0", 8, "ipv4"],
  ["carrier_grade_nat", "100.64.0.0", 10, "ipv4"],
  ["loopback", "127.0.0.0", 8, "ipv4"],
  ["link_local", "169.254.0.0", 16, "ipv4"],
  ["private", "172.16.0.0", 12, "ipv4"],
  ["reserved", "192.0.0.0", 24, "ipv4"],
  ["reserved", "192.0.2.0", 24, "ipv4"],
  ["reserved", "192.88.99.0", 24, "ipv4"],
  ["private", "192.168.0.0", 16, "ipv4"],
  ["reserved", "198.18.0.0", 15, "ipv4"],
  ["reserved", "198.51.100.0", 24, "ipv4"],
  ["reserved", "203.0.113.0", 24, "ipv4"],
  ["multicast", "224.0.0.0", 4, "ipv4"],
  ["reserved", "240.0.0.0", 4, "ipv4"],
  ["loopback", "::1", 128, "ipv6"],
  ["unspecified", "::", 128, "ipv6"],
  ["metadata", "fd00:ec2::254", 128, "ipv6"],
  ["reserved", "::", 96, "ipv6"],
  ["private", "fc00::", 7, "ipv6"],
  ["link_local", "fe80::", 10, "ipv6"],
  ["private", "fec0::", 10, "ipv6"],
  ["multicast", "ff00::", 8, "ipv6"],
  ["reserved", "64:ff9b::", 96, "ipv6"],
  ["reserved", "64:ff9b:1::", 48, "ipv6"],
  ["reserved", "100::", 64, "ipv6"],
  ["reserved", "2001::", 32, "ipv6"],
  ["reserved", "2001:db8::", 32, "ipv6"],
  ["reserved", "2002::", 16, "ipv6"],
  ["reserved", "3fff::", 20, "ipv6"],
];

const BLOCKED = RANGES.map(([reason, base, prefix, family]) => {
  const list = new BlockList();
  if (prefix === (family === "ipv4" ? 32 : 128)) list.addAddress(base, family);
  else list.addSubnet(base, prefix, family);
  return { reason, family, list } as const;
});

// IPv6 is allowed only inside global unicast (2000::/3) and outside the
// special-purpose ranges above.
const GLOBAL_UNICAST_V6 = new BlockList();
GLOBAL_UNICAST_V6.addSubnet("2000::", 3, "ipv6");

const MAPPED_V4 = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

function matchRange(address: string, family: Family): OutboundBlockReason | null {
  for (const entry of BLOCKED) {
    if (entry.family === family && entry.list.check(address, family)) return entry.reason;
  }
  return null;
}

function normalizeIpv6(address: string): string | null {
  try {
    return new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
  } catch {
    return null;
  }
}

/** `null` means the address is a public internet address; anything else is a refusal reason. */
export function classifyOutboundAddress(address: string): OutboundBlockReason | null {
  const family = isIP(address);
  if (family === 4) return matchRange(address, "ipv4");
  if (family === 6) {
    const normalized = normalizeIpv6(address);
    if (normalized === null) return "reserved";
    const mapped = MAPPED_V4.exec(normalized);
    if (mapped) {
      const high = Number.parseInt(mapped[1] ?? "0", 16);
      const low = Number.parseInt(mapped[2] ?? "0", 16);
      return matchRange(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`, "ipv4");
    }
    const hit = matchRange(normalized, "ipv6");
    if (hit !== null) return hit;
    return GLOBAL_UNICAST_V6.check(normalized, "ipv6") ? null : "not_global";
  }
  return "reserved";
}

const NON_PUBLIC_SUFFIXES = [
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home.arpa",
] as const;

/**
 * Classify the host part of a URL (as given by `URL.hostname`, which already
 * normalises decimal/hex/octal IPv4 forms). `null` means "looks public".
 */
export function classifyOutboundHost(hostname: string): OutboundBlockedReason | null {
  const host = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (host === "") return "hostname";
  if (isIP(host) !== 0) return classifyOutboundAddress(host);
  if (host === "localhost" || host.endsWith(".localhost")) return "loopback";
  // Numeric-looking names that are not canonical IPs (0x7f.1, 017700000001).
  if (/^[\d.]+$/.test(host) || /^0x[\da-f.x]+$/i.test(host)) return "hostname";
  // A single label resolves through the local search domain or mDNS.
  if (!host.includes(".")) return "hostname";
  if (NON_PUBLIC_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "hostname";
  return null;
}

export function assertPublicOutboundUrl(
  url: URL,
  options: Readonly<{ allowHttp?: boolean }> = {},
): void {
  const schemeAllowed =
    url.protocol === "https:" || (options.allowHttp === true && url.protocol === "http:");
  if (!schemeAllowed) throw new OutboundBlockedError("scheme");
  if (url.username !== "" || url.password !== "") throw new OutboundBlockedError("credentials");
  const reason = classifyOutboundHost(url.hostname);
  if (reason !== null) throw new OutboundBlockedError(reason);
}

/* -------------------------------------------------------------------------- */
/* Connection-time check                                                       */
/* -------------------------------------------------------------------------- */

type ResolveFn = (
  hostname: string,
  options: LookupOptions & { all: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

export type OutboundTestHooks = Readonly<{
  /** Replaces the socket layer. The literal-address checks still run first. */
  transport?: (url: string, init: OutboundRequestInit) => Promise<Response>;
  /** Replaces DNS resolution for the pinned transport. */
  resolve?: ResolveFn;
  /** Lets a test connect to a loopback server; never set outside tests. */
  allowAddress?: (address: string) => boolean;
}>;

let testHooks: OutboundTestHooks | null = null;

/** Test seam only: no production module may call this (pinned by a source test). */
export function __setOutboundTestHooks(next: OutboundTestHooks | null): void {
  testHooks = next;
}

function classifyForConnect(address: string): OutboundBlockReason | null {
  if (testHooks?.allowAddress?.(address) === true) return null;
  return classifyOutboundAddress(address);
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `lookup` handed to the socket. Resolves the name, classifies every address
 * and only then lets the socket connect, so the connected address is the
 * checked address. One refused address refuses the whole name (a name that
 * answers with a public and a private address is hostile or misconfigured).
 */
function pinnedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  const resolve = testHooks?.resolve ?? (dnsLookup as unknown as ResolveFn);
  resolve(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, []);
      return;
    }
    const list = addresses ?? [];
    if (list.length === 0) {
      callback(new OutboundBlockedError("hostname"), []);
      return;
    }
    for (const entry of list) {
      const reason = classifyForConnect(entry.address);
      if (reason !== null) {
        callback(new OutboundBlockedError(reason), []);
        return;
      }
    }
    if (options.all === true) {
      callback(null, list);
      return;
    }
    const first = list[0];
    if (!first) {
      callback(new OutboundBlockedError("hostname"), []);
      return;
    }
    callback(null, first.address, first.family);
  });
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */

export type OutboundRequestInit = RequestInit & { allowHttp?: boolean };

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

type Prepared = Readonly<{
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  signal: AbortSignal | null;
}>;

function prepare(init: OutboundRequestInit): Prepared {
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  let body: string | undefined;
  const raw = init.body;
  if (raw === undefined || raw === null) {
    body = undefined;
  } else if (typeof raw === "string") {
    body = raw;
  } else if (raw instanceof URLSearchParams) {
    body = raw.toString();
    headers["content-type"] ??= "application/x-www-form-urlencoded;charset=UTF-8";
  } else {
    throw new TypeError("Unsupported outbound request body");
  }
  if (body !== undefined && (method === "GET" || method === "HEAD")) {
    throw new TypeError("Outbound GET and HEAD requests cannot carry a body");
  }
  headers["accept"] ??= "*/*";
  headers["user-agent"] ??= "node";
  headers["accept-encoding"] ??= "gzip, deflate";
  if (body !== undefined) headers["content-length"] = String(Buffer.byteLength(body, "utf8"));
  return { method, headers, body, signal: init.signal ?? null };
}

function abortError(): Error {
  return new DOMException("The operation was aborted.", "AbortError");
}

function translateTransportError(error: unknown): Error {
  if (error instanceof OutboundBlockedError || error instanceof OutboundRequestError) return error;
  if (error instanceof Error && error.name === "AbortError") return error;
  const code = (error as { code?: unknown } | null)?.code;
  return new OutboundRequestError(typeof code === "string" ? code : "UNKNOWN");
}

function decoderFor(encoding: string | undefined): Transform | null {
  switch ((encoding ?? "").trim().toLowerCase()) {
    case "":
    case "identity":
      return null;
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      throw new OutboundRequestError("UNSUPPORTED_ENCODING");
  }
}

function toHeaders(raw: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(raw)) {
    const lower = key.toLowerCase();
    if (lower === "content-encoding" || lower === "content-length" || lower === "transfer-encoding") {
      continue;
    }
    try {
      if (Array.isArray(value)) for (const entry of value) headers.append(key, entry);
      else if (value !== undefined) headers.set(key, value);
    } catch {
      // A header the platform refuses to represent is dropped, not fatal.
    }
  }
  return headers;
}

function pinnedTransport(url: URL, prepared: Prepared): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const { signal } = prepared;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let settled = false;
    let request: ClientRequest | null = null;

    const onAbort = (): void => fail(abortError());
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      action();
    };
    function fail(error: unknown): void {
      finish(() => {
        request?.destroy();
        reject(translateTransportError(error));
      });
    }
    signal?.addEventListener("abort", onAbort, { once: true });

    request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port === "" ? undefined : Number(url.port),
        path: `${url.pathname}${url.search}`,
        method: prepared.method,
        headers: prepared.headers,
        lookup: pinnedLookup,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        let stream: Readable = res;
        try {
          const decoder = decoderFor(res.headers["content-encoding"]);
          if (decoder) {
            decoder.on("error", fail);
            stream = res.pipe(decoder);
          }
        } catch (error) {
          fail(error);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            fail(new OutboundRequestError("RESPONSE_TOO_LARGE"));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () =>
          finish(() => {
            const noBody =
              prepared.method === "HEAD" || status === 204 || status === 205 || status === 304;
            try {
              resolve(
                new Response(noBody ? null : new Uint8Array(Buffer.concat(chunks)), {
                  status,
                  statusText: res.statusMessage ?? "",
                  headers: toHeaders(res.headers),
                }),
              );
            } catch {
              reject(new OutboundRequestError("BAD_RESPONSE"));
            }
          }),
        );
        stream.on("error", fail);
        res.on("error", fail);
      },
    );
    request.on("error", fail);
    if (prepared.body !== undefined) request.write(prepared.body);
    request.end();
  });
}

/**
 * `fetch`-shaped request for a URL a seller supplied. Never follows redirects
 * (a 3xx is returned as-is) and never connects to a non-public address.
 */
export async function outboundFetch(
  input: string | URL,
  init: OutboundRequestInit = {},
): Promise<Response> {
  let url: URL;
  try {
    url = new URL(input.toString());
  } catch {
    throw new OutboundBlockedError("hostname");
  }
  assertPublicOutboundUrl(url, { allowHttp: init.allowHttp === true });
  const override = testHooks?.transport;
  if (override) return override(url.toString(), init);
  return pinnedTransport(url, prepare(init));
}
