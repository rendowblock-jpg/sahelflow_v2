/**
 * Messages the stdio bridge shows an agent when SahelFlow refuses a request or
 * answers with something that is not JSON-RPC (S06b-05).
 *
 * Every message is a constant. The upstream body is only ever inspected for a
 * short upper-case error code; it is never echoed to the agent, because the
 * agent's model would read it as text.
 */

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_INSPECTED_CHARS = 4096;

const KEY_REFUSED =
  "SahelFlow refused this agent: its key was revoked or is not valid. Create a new key in AI Agents → Connected agents.";
const LICENCE_REFUSED =
  "SahelFlow cannot serve agents because its licence is not active. Open the SahelFlow desktop app to check the licence, then retry.";
const TRANSPORT_REFUSED =
  "SahelFlow did not accept the local connection from this bridge. Restart SahelFlow and your agent, then retry.";

function upstreamCode(bodyText: string): string | null {
  if (!bodyText || bodyText.length > MAX_INSPECTED_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const code = (parsed as Record<string, unknown>).code;
    return typeof code === "string" && CODE_PATTERN.test(code) ? code : null;
  } catch {
    return null;
  }
}

/** The message for a 401/403 answer; a revoked key is only claimed for a grant failure. */
export function describeRefusal(status: number, bodyText: string): string {
  const code = upstreamCode(bodyText);
  if (code?.startsWith("MCP_AGENT_GRANT_")) return KEY_REFUSED;
  if (code?.startsWith("LICENSE_")) return LICENCE_REFUSED;
  if (code?.startsWith("MCP_TRANSPORT_")) return TRANSPORT_REFUSED;
  return `SahelFlow refused this request (HTTP ${status}). Check the agent's key and permissions in AI Agents → Connected agents.`;
}

function isRpcMessage(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).jsonrpc === "2.0"
  );
}

/** True only for a JSON-RPC 2.0 message or a non-empty batch of them. */
export function isJsonRpcBody(text: string): boolean {
  if (!text) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed)
      ? parsed.length > 0 && parsed.every(isRpcMessage)
      : isRpcMessage(parsed);
  } catch {
    return false;
  }
}

/** The message for an answer that is not JSON-RPC (a transport error body, HTML, ...). */
export function foreignBodyMessage(status: number): string {
  return `SahelFlow returned an unexpected response (HTTP ${status}). Retry; if it keeps happening, restart SahelFlow.`;
}
