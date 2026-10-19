import { validPublicArtifact, type PublicArtifact } from "../shared";
import type { StorefrontWorkerEnvironment } from "../types";
import { parseAcceptLanguage, parsePublicLocale, type PublicLocale } from "./locale";
import { renderNoticePage, type NoticeKind } from "./notice-page";
import type { RenderStorePage, StockRow } from "./types";

/** The part of the Workers Cache API this route uses. */
export type CacheLike = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};

export type PageContext = { waitUntil: (promise: Promise<unknown>) => void };

export type PageDeps = {
  render: RenderStorePage;
  cssPath: string;
  cache: CacheLike | null;
};

/**
 * How long a rendered page may be reused. Short on purpose: sold-out and
 * low-stock badges ride on it, and checkout re-checks stock regardless. A new
 * release shows up within this window.
 */
export const PAGE_TTL_SECONDS = 15;
const NOTICE_TTL_SECONDS = 10;

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' https:",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
].join("; ");

type PageRow = {
  state: "active" | "paused";
  release_id: string | null;
  locale: PublicLocale | null;
  artifact_json: string | null;
};

type Built = { response: Response; cacheable: boolean };

/**
 * One line per failure in the Worker log (observability is on), so a broken
 * store is findable. Only the store address and the error text: no visitor data.
 */
function logFailure(stage: "database" | "artifact" | "render", slug: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event: "storefront_page_failed",
      stage,
      slug,
      message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
    }),
  );
}

function htmlResponse(
  html: string,
  status: number,
  locale: PublicLocale,
  cssPath: string,
  ttlSeconds: number,
  extra: Record<string, string> = {},
): Response {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Language": locale,
      "Cache-Control": ttlSeconds > 0 ? `public, max-age=${ttlSeconds}` : "no-store",
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
      Link: `<${cssPath}>; rel=preload; as=style`,
      ...extra,
    },
  });
}

function notice(
  kind: NoticeKind,
  status: number,
  locale: PublicLocale,
  deps: PageDeps,
  ttlSeconds: number,
  extra: Record<string, string> = {},
): Built {
  const html = renderNoticePage({ locale, kind, cssPath: deps.cssPath });
  return {
    response: htmlResponse(html, status, locale, deps.cssPath, ttlSeconds, extra),
    cacheable: ttlSeconds > 0,
  };
}

async function build(
  url: URL,
  environment: StorefrontWorkerEnvironment,
  slug: string,
  requested: PublicLocale | null,
  deps: PageDeps,
): Promise<Built> {
  let row: PageRow | null;
  let allocations: Array<{ item_key: string; unit_price_dzd: number; remaining_quantity: number }>;
  try {
    row = await environment.DB.prepare(
      `SELECT s.state, r.release_id, r.locale, r.artifact_json
         FROM storefront s
         LEFT JOIN storefront_release r
           ON r.release_id = s.active_release_id AND r.storefront_id = s.storefront_id
        WHERE s.slug = ?1`,
    )
      .bind(slug)
      .first<PageRow>();
    allocations = row?.release_id
      ? ((
          await environment.DB.prepare(
            `SELECT item_key, unit_price_dzd, remaining_quantity
               FROM storefront_allocation
              WHERE release_id = ?1
              ORDER BY item_key ASC`,
          )
            .bind(row.release_id)
            .all<{ item_key: string; unit_price_dzd: number; remaining_quantity: number }>()
        ).results ?? [])
      : [];
  } catch (error) {
    logFailure("database", slug, error);
    return notice("error", 503, requested ?? "ar", deps, 0, { "Retry-After": "30" });
  }

  const fallbackLocale = requested ?? row?.locale ?? "ar";
  if (!row || !row.release_id || !row.artifact_json || !row.locale) {
    return notice("notFound", 404, fallbackLocale, deps, NOTICE_TTL_SECONDS);
  }
  if (row.state !== "active") {
    return notice("paused", 503, fallbackLocale, deps, NOTICE_TTL_SECONDS, { "Retry-After": "600" });
  }

  let artifact: PublicArtifact;
  try {
    const parsed: unknown = JSON.parse(row.artifact_json);
    if (!validPublicArtifact(parsed)) throw new Error("invalid artifact");
    artifact = parsed;
  } catch (error) {
    logFailure("artifact", slug, error);
    return notice("error", 503, fallbackLocale, deps, 0, { "Retry-After": "300" });
  }

  const stock = new Map<string, StockRow>(
    allocations.map((allocation) => [
      allocation.item_key,
      { unitPriceDzd: allocation.unit_price_dzd, remaining: allocation.remaining_quantity },
    ]),
  );
  const locale = requested ?? row.locale;
  try {
    const html = deps.render({
      origin: url.origin,
      slug,
      locale,
      defaultLocale: row.locale,
      artifact,
      stock,
      cssPath: deps.cssPath,
    });
    return { response: htmlResponse(html, 200, locale, deps.cssPath, PAGE_TTL_SECONDS), cacheable: true };
  } catch (error) {
    logFailure("render", slug, error);
    return notice("error", 500, locale, deps, 0, { "Retry-After": "300" });
  }
}

function withCacheState(response: Response, state: "hit" | "miss"): Response {
  const copy = new Response(response.body, response);
  copy.headers.set("X-SF-Cache", state);
  return copy;
}

/**
 * GET /<slug>: the published store as a server-rendered HTML page.
 *
 * Every page view runs this Worker once, and on Workers Free that counts against
 * the account's 100,000 requests per day. The edge cache below spares the
 * database and the render, not the request itself.
 */
export async function servePublicStorePage(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  slug: string,
  context: PageContext | undefined,
  deps: PageDeps,
): Promise<Response> {
  const url = new URL(request.url);
  const requested =
    parsePublicLocale(url.searchParams.get("lang")) ?? parseAcceptLanguage(request.headers.get("Accept-Language"));
  // The key names the page, never the visitor: only the slug and the language
  // choice vary the HTML, so two buyers share one cached copy.
  const cacheKey = new Request(`${url.origin}/__sf/page/${slug}/${requested ?? "auto"}`);

  if (deps.cache) {
    const hit = await deps.cache.match(cacheKey).catch(() => undefined);
    if (hit) return withCacheState(hit, "hit");
  }
  const built = await build(url, environment, slug, requested, deps);
  if (deps.cache && built.cacheable) {
    const stored = deps.cache.put(cacheKey, built.response.clone()).catch(() => undefined);
    if (context) context.waitUntil(stored);
    else await stored;
  }
  return withCacheState(built.response, "miss");
}
