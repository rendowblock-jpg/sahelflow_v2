import { checkout } from "./checkout";
import { createStorefront } from "./create-storefront";
import { listReleases } from "./list-releases";
import { publicStorefront } from "./public-storefront";
import { publishRelease } from "./publish-release";
import { completeReceipt, pollReceipts, receiptStatus } from "./receipts";
import { rollbackRelease } from "./rollback-release";
import { json } from "./shared";
import type { StorefrontWorkerEnvironment } from "./types";

async function health(environment: StorefrontWorkerEnvironment): Promise<Response> {
  try {
    await environment.DB.prepare("SELECT storefront_id FROM storefront LIMIT 1")
      .first<{ storefront_id: string }>();
    await environment.DB.prepare("SELECT receipt_id FROM storefront_receipt LIMIT 1")
      .first<{ receipt_id: string }>();
    return json({ status: "ok" });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}

export async function handleStorefrontRequest(
  request: Request,
  environment: StorefrontWorkerEnvironment,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/healthz") {
    return health(environment);
  }
  if (request.method === "POST" && url.pathname === "/v1/desktop/storefronts") {
    return createStorefront(request, environment);
  }
  if (request.method === "GET" && url.pathname === "/v1/desktop/storefront/receipts") {
    return pollReceipts(request, environment, url);
  }

  const releaseMatch =
    /^\/v1\/desktop\/storefronts\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/releases$/.exec(
      url.pathname,
    );
  if (request.method === "POST" && releaseMatch?.[1]) {
    return publishRelease(request, environment, releaseMatch[1]);
  }
  if (request.method === "GET" && releaseMatch?.[1]) {
    return listReleases(request, environment, releaseMatch[1], url);
  }
  const rollbackMatch =
    /^\/v1\/desktop\/storefronts\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/rollback$/.exec(
      url.pathname,
    );
  if (request.method === "POST" && rollbackMatch?.[1]) {
    return rollbackRelease(request, environment, rollbackMatch[1]);
  }
  const completeMatch =
    /^\/v1\/desktop\/storefront\/receipts\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})\/result$/.exec(
      url.pathname,
    );
  if (request.method === "POST" && completeMatch?.[1]) {
    return completeReceipt(request, environment, completeMatch[1]);
  }

  const publicMatch = /^\/v1\/storefront\/([a-z0-9][a-z0-9-]{2,62})$/.exec(
    url.pathname,
  );
  if (request.method === "GET" && publicMatch?.[1]) {
    return publicStorefront(environment, publicMatch[1]);
  }
  const checkoutMatch =
    /^\/v1\/storefront\/([a-z0-9][a-z0-9-]{2,62})\/checkout$/.exec(url.pathname);
  if (request.method === "POST" && checkoutMatch?.[1]) {
    return checkout(request, environment, checkoutMatch[1]);
  }
  const receiptMatch =
    /^\/v1\/storefront\/receipts\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})$/.exec(url.pathname);
  if (request.method === "GET" && receiptMatch?.[1]) {
    return receiptStatus(environment, receiptMatch[1]);
  }
  return json({ error: "not_found" }, 404);
}

export default { fetch: handleStorefrontRequest };
