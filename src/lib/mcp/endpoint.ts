/**
 * MCP endpoint publication (FD-063, MCP-11).
 *
 * The packaged app listens on a loopback port chosen at every launch, and an
 * MCP client (Claude Desktop, Cursor, …) starts the stdio bridge on its own.
 * The bridge therefore needs a stable place to learn where the app is. On
 * each server start this module publishes, inside the app's data directory:
 *
 *   mcp/transport-token  a fresh launch-scoped transport secret (0600), unless
 *                        the shell provided one through MCP_SIDECAR_TOKEN(_FILE)
 *   mcp/endpoint.json    { version, url, tokenFile, publishedAt }
 *
 * The transport token only authorizes the loopback transport. Authority is
 * still the agent's grant and its durable identity binding.
 */
import "server-only";

import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export const MCP_ENDPOINT_FORMAT_VERSION = 1 as const;

export interface McpEndpointDescriptor {
  version: typeof MCP_ENDPOINT_FORMAT_VERSION;
  url: string;
  tokenFile: string;
  publishedAt: string;
}

/** The app's data root, resolved exactly like the other durable stores. */
export function mcpDataRoot(): string {
  const configured = process.env.SF_DATA_DIR;
  if (configured) return resolve(configured);
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl?.startsWith("file:")) {
    const databaseDirectory = dirname(resolve(databaseUrl.slice("file:".length)));
    if (basename(databaseDirectory).toLowerCase() === "shops") {
      return dirname(databaseDirectory);
    }
  }
  return resolve(process.cwd(), "data");
}

export function mcpDirectory(): string {
  return join(mcpDataRoot(), "mcp");
}

export function defaultMcpTransportTokenFile(): string {
  return join(mcpDirectory(), "transport-token");
}

export function mcpEndpointFile(): string {
  return join(mcpDirectory(), "endpoint.json");
}

/** Loopback origin of this app instance. */
export function mcpAppUrl(): string {
  const configured = process.env.SF_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  return `http://127.0.0.1:${Number.isFinite(port) ? port : 3000}`;
}

/** Installed path of the stdio bridge, when the desktop shell reports it. */
export function mcpBridgePath(): string | null {
  const configured = process.env.SF_MCP_BRIDGE_PATH?.trim();
  return configured ? configured : null;
}

async function writePrivate(path: string, contents: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await chmod(temporary, 0o600).catch(() => undefined);
  await rename(temporary, path);
}

/**
 * Publish this launch's endpoint. A shell-provided token file is advertised
 * as is; otherwise a fresh token is minted for this launch.
 */
export async function publishMcpEndpoint(): Promise<McpEndpointDescriptor> {
  const directory = mcpDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });

  let tokenFile = process.env.MCP_SIDECAR_TOKEN_FILE?.trim() || "";
  if (!tokenFile && !process.env.MCP_SIDECAR_TOKEN?.trim()) {
    tokenFile = defaultMcpTransportTokenFile();
    await writePrivate(tokenFile, randomBytes(32).toString("base64url"));
  }

  const descriptor: McpEndpointDescriptor = {
    version: MCP_ENDPOINT_FORMAT_VERSION,
    url: mcpAppUrl(),
    tokenFile,
    publishedAt: new Date().toISOString(),
  };
  await writePrivate(mcpEndpointFile(), `${JSON.stringify(descriptor, null, 2)}\n`);
  return descriptor;
}
