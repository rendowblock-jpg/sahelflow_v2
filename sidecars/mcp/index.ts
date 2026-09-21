/**
 * SahelFlow MCP sidecar (FD-063).
 *
 * A deliberately thin bridge: newline-delimited JSON-RPC on stdio in one
 * direction, the desktop's loopback `POST /api/mcp` in the other. Every
 * authority decision — scope hiding, privacy projection, the proposal gate,
 * rate limiting, audit — lives in the Next.js runtime. This process holds no
 * business logic and no credentials beyond the launch-scoped transport token it
 * is handed.
 *
 * Why a bridge rather than a second server: desktop MCP clients overwhelmingly
 * speak stdio, and SahelFlow must not open a listening port to give an agent
 * access to a seller's shop.
 *
 * Environment:
 *   SAHELFLOW_BASE_URL          loopback origin of the packaged app
 *                               (default http://127.0.0.1:3000)
 *   MCP_SIDECAR_TOKEN           transport bearer token, or
 *   MCP_SIDECAR_TOKEN_FILE      a file containing it
 *   SAHELFLOW_SESSION_COOKIE    the durable Founder session cookie the desktop
 *                               shell forwards; without it the app answers with
 *                               zero tools, by design
 *   MCP_CONNECTION_ID           stable label for this connection's audit rows
 */

const BASE_URL = (
  process.env.SAHELFLOW_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/+$/, "");
const CONNECTION_ID = process.env.MCP_CONNECTION_ID ?? "stdio";
const REQUEST_TIMEOUT_MS = 30_000;

function loadToken(): string {
  const inline = process.env.MCP_SIDECAR_TOKEN?.trim();
  if (inline) return inline;
  const path = process.env.MCP_SIDECAR_TOKEN_FILE?.trim();
  if (path) {
    try {
      return require("node:fs").readFileSync(path, "utf8").trim();
    } catch {
      return "";
    }
  }
  return "";
}

const TOKEN = loadToken();

function fatal(message: string): never {
  process.stderr.write(`[sahelflow-mcp] ${message}\n`);
  process.exit(1);
}

if (!TOKEN) {
  fatal(
    "no transport token: set MCP_SIDECAR_TOKEN or MCP_SIDECAR_TOKEN_FILE. Refusing to start.",
  );
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${TOKEN}`,
      "x-sahelflow-mcp-connection": CONNECTION_ID,
    };
    const cookie = process.env.SAHELFLOW_SESSION_COOKIE?.trim();
    if (cookie) headers.cookie = cookie;

    const response = await fetch(`${BASE_URL}/api/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
      signal: controller.signal,
    });

    if (response.status === 202) return;
    if (!response.ok && response.status === 401) {
      if (hasId) {
        transportError(
          id,
          "SahelFlow rejected the agent session. Reconnect from the desktop app.",
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
