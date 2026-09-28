/**
 * The durable request line an MCP agent call leaves in its transcript session
 * (`src/lib/mcp/transcript.ts`). It exists so a proposal is bound to a
 * persisted request; people should read it as "the agent asked to …", never
 * as raw JSON.
 */
export interface McpRequestLine {
  tool: string;
}

export function parseMcpRequestLine(content: string | null | undefined): McpRequestLine | null {
  if (!content || !content.startsWith('{"via":"mcp"')) return null;
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (record.via !== "mcp" || typeof record.tool !== "string" || !record.tool) return null;
    return { tool: record.tool };
  } catch {
    return null;
  }
}
