/**
 * MCP transport authorization (FD-063).
 *
 * Loopback only, bearer token, timing-safe comparison — the same contract the
 * WhatsApp sidecar already uses, so there is one reviewed local-transport
 * pattern in the product rather than two.
 *
 * The token is a launch-scoped secret the desktop shell mints and hands to the
 * MCP sidecar. It authorizes the *transport*; it is not identity. Identity is
 * still the durable Founder session the sidecar forwards, and authority is
 * still the permission check plus the proposal gate.
 */
import "server-only";

import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";

import { SahelFlowError } from "@/types/errors";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

let cachedToken: string | null = null;

function unauthorized(message: string, code: string): SahelFlowError {
  return new SahelFlowError(message, code, 401);
}

function sameToken(left: string, right: string): boolean {
  const first = Buffer.from(left, "utf8");
  const second = Buffer.from(right, "utf8");
  if (first.length !== second.length) return false;
  return timingSafeEqual(first, second);
}

async function resolveExpectedToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const inline = process.env.MCP_SIDECAR_TOKEN?.trim();
  if (inline) {
    cachedToken = inline;
    return cachedToken;
  }
  const path = process.env.MCP_SIDECAR_TOKEN_FILE?.trim();
  if (!path) return null;
  try {
    const contents = (await readFile(path, "utf8")).trim();
    cachedToken = contents || null;
    return cachedToken;
  } catch {
    return null;
  }
}

/** Test/relaunch helper: drop the memoized token. */
export function resetMcpTransportToken(): void {
  cachedToken = null;
}

function assertLoopback(request: Request): void {
  const host = (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase();
  if (!host || !LOOPBACK_HOSTS.has(host)) {
    throw unauthorized(
      "The MCP surface is reachable on loopback only",
      "MCP_TRANSPORT_NOT_LOOPBACK",
    );
  }
  if (request.headers.get("x-forwarded-for")) {
    throw unauthorized(
      "The MCP surface refuses proxied requests",
      "MCP_TRANSPORT_PROXIED",
    );
  }
}

/**
 * Authorize one MCP transport request and return a stable connection id used to
 * derive the agent's non-person audit identity.
 */
export async function authorizeMcpTransport(
  request: Request,
): Promise<{ connectionId: string }> {
  assertLoopback(request);

  const expected = await resolveExpectedToken();
  if (!expected) {
    // Fail closed. An unconfigured token means the desktop shell did not
    // provision this surface, so it must not answer at all.
    throw unauthorized(
      "The MCP surface is not provisioned on this installation",
      "MCP_TRANSPORT_TOKEN_UNAVAILABLE",
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented || !sameToken(presented, expected)) {
    throw unauthorized("Unauthorized", "MCP_TRANSPORT_UNAUTHORIZED");
  }

  const connectionId =
    request.headers.get("x-sahelflow-mcp-connection")?.trim().slice(0, 128) ||
    "default";
  return { connectionId };
}
