import "server-only";

import { lookup as dnsLookup } from "node:dns/promises";

/**
 * Ledger INB-16 — WhatsApp-style link previews for the inbox thread.
 *
 * The card metadata is fetched SERVER-SIDE only: the Tauri webview runs a
 * loopback-only CSP, so the renderer never loads external content directly.
 * The route re-exports this module's result; the card degrades silently to
 * the plain text bubble when a preview cannot be fetched (honest absence —
 * nothing is ever fabricated to fill the card).
 *
 * Security shape (SSRF discipline):
 *  - http/https only, no credentials in the URL, ports 80/443 only;
 *  - every redirect hop is re-resolved and re-validated (manual redirect
 *    following, max 3 hops);
 *  - hostnames resolve before the fetch and loopback/private/link-local
 *    ranges are refused;
 *  - the response body is capped (64 KiB is enough for metadata markup) and
 *    the wall clock is bounded;
 *  - a small LRU cache with a TTL keeps repeat renders free of network
 *    traffic and bounds the process's outbound footprint.
 */

const PREVIEW_TIMEOUT_MS = 4_000;
const MAX_HTML_BYTES = 64 * 1024;
const MAX_REDIRECT_HOPS = 3;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;

export interface LinkPreview {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
}

interface CacheEntry {
  preview: LinkPreview | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Literal hosts that must never be fetched from the app process. */
function isBlockedLiteralHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[/, "")
    .replace(/\]$/, "");
  // IPv6 literal (brackets are stripped by URL parsing).
  if (host.includes(":")) {
    // IPv4-mapped IPv6 (::ffff:10.0.0.1 / ::ffff:a00:1) — no legitimate
    // preview target uses a mapped literal; refuse the whole family.
    if (host.startsWith("::ffff:")) return true;
    const compact = host.replace(/^0+/, "") || "0";
    if (
      compact === "::1" ||
      compact === "::" ||
      compact.startsWith("fc") ||
      compact.startsWith("fd") ||
      compact.startsWith("fe80")
    ) {
      return true;
    }
    return false;
  }
  // IPv4 literal.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return isBlockedIPv4(host);
  return false;
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/** Validate and normalize a candidate preview URL. Returns null when the URL
 *  is not a plain public http(s) web address. */
export function normalizePreviewUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  if (!url.hostname || url.hostname.includes("%")) return null;
  if (isBlockedLiteralHost(url.hostname)) return null;
  return url;
}

interface ResolveDeps {
  lookup?: (hostname: string) => Promise<{ address: string }>;
  fetchHtml?: (
    url: string,
    init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
  ) => Promise<Response>;
  now?: () => number;
}

async function resolveHost(
  hostname: string,
  deps: ResolveDeps,
): Promise<boolean> {
  if (!hostname.includes(":") && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return !isBlockedIPv4(hostname);
  }
  try {
    const lookup = deps.lookup ?? ((host: string) => dnsLookup(host));
    const { address } = await lookup(hostname);
    return !isBlockedLiteralHost(address) && !isBlockedIPv4(address);
  } catch {
    return false;
  }
}

function metaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      const value = match[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .trim()
        .slice(0, 300);
      if (value) return value;
    }
  }
  return null;
}

function pageTitle(html: string): string | null {
  const match = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html);
  if (!match?.[1]) return null;
  return match[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
    .slice(0, 300);
}

/** Fetch + parse one URL into card metadata, or null (honest absence). */
export async function getLinkPreview(
  rawUrl: string,
  deps: ResolveDeps = {},
): Promise<LinkPreview | null> {
  const now = deps.now ?? Date.now;
  const cached = cache.get(rawUrl);
  if (cached && cached.expiresAt > now()) {
    // Refresh recency for the LRU bound.
    cache.delete(rawUrl);
    cache.set(rawUrl, cached);
    return cached.preview;
  }

  const preview = await fetchPreview(rawUrl, deps);
  cache.set(rawUrl, { preview, expiresAt: now() + CACHE_TTL_MS });
  if (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return preview;
}

async function fetchPreview(
  rawUrl: string,
  deps: ResolveDeps,
): Promise<LinkPreview | null> {
  let current = normalizePreviewUrl(rawUrl);
  if (!current) return null;

  const doFetch =
    deps.fetchHtml ??
    ((url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) =>
      fetch(url, init));

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const allowed = await resolveHost(current.hostname, deps);
    if (!allowed) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // Ask for text markup; previews never download binaries.
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "SahelFlow/1.0 link-preview",
        },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return null;
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") return null;
      if (next.port && next.port !== "80" && next.port !== "443") return null;
      if (isBlockedLiteralHost(next.hostname)) return null;
      current = next;
      continue;
    }

    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(contentType)) return null;

    const reader = response.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let total = 0;
      try {
        while (html.length < MAX_HTML_BYTES) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_HTML_BYTES) {
            await reader.cancel().catch(() => undefined);
            break;
          }
          html += decoder.decode(value, { stream: true });
        }
      } catch {
        // A truncated body still carries whatever markup arrived; fall
        // through to the parser with what we have.
      } finally {
        reader.releaseLock();
      }
    }

    const title =
      metaContent(html, "og:title") ??
      metaContent(html, "twitter:title") ??
      pageTitle(html);
    const description =
      metaContent(html, "og:description") ??
      metaContent(html, "twitter:description") ??
      metaContent(html, "description");
    const siteName = metaContent(html, "og:site_name");
    if (!title && !description) return null;
    return {
      url: current.toString(),
      domain: current.hostname.toLowerCase(),
      title,
      description,
      siteName,
    };
  }
  return null;
}

/** First http(s) URL inside a message body (trailing punctuation stripped). */
export function firstHttpUrlInText(body: string): string | null {
  const match = /https?:\/\/[^\s<>"'）)\]]+/i.exec(body);
  if (!match) return null;
  return match[0].replace(/[).,;:!?'"]+$/, "");
}

/** Test-only cache reset. */
export function resetLinkPreviewCacheForTests(): void {
  cache.clear();
}
