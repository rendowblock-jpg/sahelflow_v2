import "server-only";

import { z } from "zod";

import { SahelFlowError } from "@/types/errors";

/**
 * HTTP client for the seller's Apps Script bridge (bridge-script.ts).
 *
 * Only a Google Apps Script web-app URL is ever called (strict allowlist, so a
 * pasted URL can never point this server at another host), the key travels in
 * the POST body (never the URL), and every response is schema-checked. Google
 * answers a web-app POST with a redirect to script.googleusercontent.com; the
 * final host is checked too.
 */

const WEB_APP_URL =
  /^https:\/\/script\.google\.com\/(?:a\/macros\/[A-Za-z0-9.-]+|macros)\/s\/[A-Za-z0-9_-]{20,200}\/exec$/;
const ALLOWED_FINAL_HOSTS = new Set(["script.google.com", "script.googleusercontent.com"]);
const DEFAULT_TIMEOUT_MS = 30_000;

export type BridgeErrorCode =
  | "SHEETS_BRIDGE_URL_INVALID"
  | "SHEETS_BRIDGE_UNREACHABLE"
  | "SHEETS_BRIDGE_ACCESS"
  | "SHEETS_BRIDGE_UNAUTHORIZED"
  | "SHEETS_BRIDGE_SHEET_NOT_FOUND"
  | "SHEETS_BRIDGE_BUSY"
  | "SHEETS_BRIDGE_SCRIPT_ERROR"
  | "SHEETS_BRIDGE_OUTDATED"
  | "SHEETS_BRIDGE_BAD_RESPONSE";

function bridgeError(code: BridgeErrorCode, message: string, status = 502): SahelFlowError {
  return new SahelFlowError(message, code, status);
}

/** Canonical web-app URL, or a coded 400. Query strings and fragments are dropped. */
export function normalizeBridgeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw bridgeError("SHEETS_BRIDGE_URL_INVALID", "Paste the Web app URL that ends with /exec", 400);
  }
  const candidate = `${url.protocol}//${url.host}${url.pathname}`;
  if (!WEB_APP_URL.test(candidate)) {
    throw bridgeError(
      "SHEETS_BRIDGE_URL_INVALID",
      "Paste the Web app URL that starts with https://script.google.com and ends with /exec",
      400,
    );
  }
  return candidate;
}

const pingSchema = z.object({
  ok: z.literal(true),
  version: z.number().int(),
  spreadsheetId: z.string().min(1).max(200),
  spreadsheetName: z.string().max(500),
  sheet: z.string().max(200),
  sheets: z.array(z.string().max(200)).max(200),
  headers: z.array(z.string().max(300)).max(200),
  rowCount: z.number().int().nonnegative(),
  timeZone: z.string().max(100).optional(),
});

const rowsSchema = z.object({
  ok: z.literal(true),
  rows: z
    .array(
      z.object({
        row: z.number().int().positive(),
        id: z.string().min(1).max(100),
        status: z.string().max(300).optional(),
        cells: z.record(z.string().max(300), z.string().max(5_000)),
      }),
    )
    .max(500),
  nextRow: z.number().int().positive(),
  lastRow: z.number().int().nonnegative(),
});

const statusSchema = z.object({
  ok: z.literal(true),
  updated: z.number().int().nonnegative(),
  missing: z.array(z.string().max(100)).max(500),
});

const failureSchema = z.object({
  ok: z.literal(false),
  error: z.string().max(80),
  message: z.string().max(400).optional(),
});

export type BridgePing = z.infer<typeof pingSchema>;
export type BridgeRows = z.infer<typeof rowsSchema>;
export type BridgeRow = BridgeRows["rows"][number];
export type BridgeStatusResult = z.infer<typeof statusSchema>;

export interface BridgeTarget {
  url: string;
  key: string;
}

type Fetcher = typeof fetch;

async function call(
  target: BridgeTarget,
  body: Record<string, unknown>,
  fetcher: Fetcher,
  timeoutMs: number,
): Promise<unknown> {
  const url = normalizeBridgeUrl(target.url);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      // text/plain keeps the request "simple"; Apps Script reads the raw body.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, key: target.key }),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw bridgeError(
      "SHEETS_BRIDGE_UNREACHABLE",
      "Google Sheets did not answer. Check the internet connection and try again.",
    );
  }
  if (response.url) {
    const finalHost = new URL(response.url).host;
    if (!ALLOWED_FINAL_HOSTS.has(finalHost)) {
      throw bridgeError("SHEETS_BRIDGE_ACCESS", "The web app redirected to a Google sign-in page.");
    }
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("json")) {
    throw bridgeError(
      "SHEETS_BRIDGE_ACCESS",
      "The script is not deployed for \"Anyone\". In Apps Script: Deploy → Manage deployments → Who has access: Anyone.",
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw bridgeError("SHEETS_BRIDGE_BAD_RESPONSE", "The script returned an unreadable answer.");
  }
  const failure = failureSchema.safeParse(payload);
  if (failure.success) {
    switch (failure.data.error) {
      case "UNAUTHORIZED":
        throw bridgeError(
          "SHEETS_BRIDGE_UNAUTHORIZED",
          "The script's key does not match. Copy the script from SahelFlow again and redeploy it.",
          401,
        );
      case "SHEET_NOT_FOUND":
        throw bridgeError("SHEETS_BRIDGE_SHEET_NOT_FOUND", "That tab no longer exists in the spreadsheet.", 404);
      case "BUSY":
        throw bridgeError("SHEETS_BRIDGE_BUSY", "The sheet is busy. SahelFlow will try again shortly.", 503);
      default:
        throw bridgeError(
          "SHEETS_BRIDGE_SCRIPT_ERROR",
          `The script reported an error${failure.data.message ? `: ${failure.data.message}` : "."}`,
        );
    }
  }
  return payload;
}

function parsed<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw bridgeError(
      "SHEETS_BRIDGE_OUTDATED",
      "The script in the sheet is outdated or modified. Copy it from SahelFlow again and redeploy.",
    );
  }
  return result.data;
}

export async function pingBridge(
  target: BridgeTarget,
  options: { sheet?: string; fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<BridgePing> {
  return parsed(
    pingSchema,
    await call(
      target,
      { action: "ping", ...(options.sheet ? { sheet: options.sheet } : {}) },
      options.fetcher ?? fetch,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ),
  );
}

export async function readBridgeRows(
  target: BridgeTarget,
  request: { sheet?: string; fromRow: number; limit: number },
  options: { fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<BridgeRows> {
  return parsed(
    rowsSchema,
    await call(
      target,
      { action: "rows", ...request },
      options.fetcher ?? fetch,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ),
  );
}

export async function writeBridgeStatuses(
  target: BridgeTarget,
  request: {
    sheet?: string;
    updates: Array<{ id: string; status: string; order: string; tracking: string }>;
  },
  options: { fetcher?: Fetcher; timeoutMs?: number } = {},
): Promise<BridgeStatusResult> {
  return parsed(
    statusSchema,
    await call(
      target,
      { action: "status", ...request },
      options.fetcher ?? fetch,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ),
  );
}
