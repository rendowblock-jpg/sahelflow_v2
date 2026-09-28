/**
 * SahelFlow MCP sidecar (FD-063).
 *
 * A deliberately thin bridge: newline-delimited JSON-RPC on stdio in one
 * direction, the desktop's loopback `POST /api/mcp` in the other. Every
 * authority decision — scope hiding, privacy projection, the proposal gate,
 * rate limiting, audit — lives in the Next.js runtime. This process holds no
 * business logic and holds only the agent's grant key.
 *
 * Why a bridge rather than a second server: desktop MCP clients overwhelmingly
 * speak stdio, and SahelFlow must not open a listening port to give an agent
 * access to a seller's shop. The MCP client launches this bridge itself; the
 * bridge finds the running app through the `mcp/endpoint.json` the app
 * publishes in its data directory at every launch (MCP-11).
 *
 * Environment:
 *   SAHELFLOW_AGENT_GRANT       required: the agent's key, created and revocable
 *                               in AI Agents → Connected agents
 *   SAHELFLOW_DATA_DIR          optional: the app's data directory when it is
 *                               not the platform default for com.sahelflow.desktop
 *   SAHELFLOW_BASE_URL          optional override of the published app origin
 *   MCP_SIDECAR_TOKEN(_FILE)    optional override of the published transport token
 *   MCP_CONNECTION_ID           optional label for this connection's audit rows
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_IDENTIFIER = "com.sahelflow.desktop";
const CONNECTION_ID = process.env.MCP_CONNECTION_ID ?? "stdio";
const REQUEST_TIMEOUT_MS = 30_000;
const GRANT = process.env.SAHELFLOW_AGENT_GRANT?.trim() ?? "";

function fatal(message: string): never {
  process.stderr.write(`[sahelflow-mcp] ${message}\n`);
  process.exit(1);
}

if (!GRANT) {
  fatal(
    "no agent key: create one in SahelFlow → AI Agents → Connected agents and set it as SAHELFLOW_AGENT_GRANT.",
  );
}

/** The desktop app's data directory, where it publishes mcp/endpoint.json. */
function appDataDirectory(): string {
  const configured = process.env.SAHELFLOW_DATA_DIR?.trim();
  if (configured) return configured;
  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), APP_IDENTIFIER);
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", APP_IDENTIFIER);
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), APP_IDENTIFIER);
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

interface Endpoint {
  url: string;
  token: string;
}

/**
 * Resolve where the running app listens. Re-read on every request: the app
 * chooses a new loopback port and transport token at each launch, and an agent
 * session often outlives an app restart.
 */
function resolveEndpoint(): Endpoint | null {
  let descriptor: { url?: unknown; tokenFile?: unknown } = {};
  const published = readText(join(appDataDirectory(), "mcp", "endpoint.json"));
  if (published) {
    try {
      descriptor = JSON.parse(published) as typeof descriptor;
    } catch {
      descriptor = {};
    }
  }
  const url = (
    process.env.SAHELFLOW_BASE_URL?.trim() ||
    (typeof descriptor.url === "string" ? descriptor.url : "")
  ).replace(/\/+$/, "");
  const tokenFile =
    process.env.MCP_SIDECAR_TOKEN_FILE?.trim() ||
    (typeof descriptor.tokenFile === "string" ? descriptor.tokenFile : "");
  const token =
    process.env.MCP_SIDECAR_TOKEN?.trim() || (tokenFile ? readText(tokenFile) : "");
  return url && token ? { url, token } : null;
}

function write(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function transportError(id: unknown, message: string): void {
  write({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code: -32000, message },
  });
}

async function forward(message: unknown): Promise<void> {
  const id =
    message && typeof message === "object"
      ? (message as Record<string, unknown>).id
      : null;
  const hasId =
    !!message &&
    typeof message === "object" &&
    "id" in (message as Record<string, unknown>);

  const endpoint = resolveEndpoint();
  if (!endpoint) {
    if (hasId) {
      transportError(id, "SahelFlow is not running. Open the SahelFlow desktop app and retry.");
    }
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${endpoint.token}`,
      "x-sahelflow-mcp-connection": CONNECTION_ID,
      "x-sahelflow-agent-grant": GRANT,
    };

    const response = await fetch(`${endpoint.url}/api/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      signal: controller.signal,
    });

    if (response.status === 202) return;
    if (!response.ok && (response.status === 401 || response.status === 403)) {
      if (hasId) {
        transportError(
          id,
          "SahelFlow refused this agent: its key was revoked or is not valid. Create a new key in AI Agents → Connected agents.",
        );
      }
      return;
    }

    const text = await response.text();
    if (!text) {
      if (hasId) transportError(id, "Empty response from SahelFlow");
      return;
    }
    process.stdout.write(`${text.trim()}\n`);
  } catch (error) {
    if (hasId) {
      transportError(
        id,
        error instanceof Error && error.name === "AbortError"
          ? "SahelFlow did not answer in time"
          : "SahelFlow is unavailable",
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

let buffer = "";
let queue: Promise<void> = Promise.resolve();

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  // Tolerate CRLF: a Windows-launched client may emit either terminator.
  let index = buffer.indexOf("\n");
  while (index !== -1) {
    const line = buffer.slice(0, index).replace(/\r$/, "").trim();
    buffer = buffer.slice(index + 1);
    if (line) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        write({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" },
        });
        parsed = undefined;
      }
      if (parsed !== undefined) {
        // Strict ordering: MCP clients expect responses in request order.
        queue = queue.then(() => forward(parsed));
      }
    }
    index = buffer.indexOf("\n");
  }
});

process.stdin.on("end", () => {
  void queue.then(() => process.exit(0));
});
