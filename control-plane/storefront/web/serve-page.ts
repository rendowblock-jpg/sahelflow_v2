import "./react-global";
import manifest from "./asset-manifest.generated.json";
import { servePublicStorePage as route, type CacheLike, type PageContext } from "./page-route";
import { renderStorePage } from "./render-store-page";
import type { StorefrontWorkerEnvironment } from "../types";

function edgeCache(): CacheLike | null {
  const storage = (globalThis as { caches?: { default?: CacheLike } }).caches;
  return storage?.default ?? null;
}

/**
 * The Worker's entry to the hosted page. worker.ts loads this module on first
 * use, so the React renderer is initialised only by a page view, never by a
 * checkout or a desktop call.
 */
export function servePublicStorePage(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  slug: string,
  context?: PageContext,
): Promise<Response> {
  return route(request, environment, slug, context, {
    render: renderStorePage,
    cssPath: manifest.css,
    cache: edgeCache(),
  });
}
