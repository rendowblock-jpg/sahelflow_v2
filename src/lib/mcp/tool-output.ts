/**
 * Tool output contracts — CodFlow convention (EX-5 §7).
 *
 * Every tool advertises an `outputSchema`: a Zod union of
 * `{success: true, …payload}` / `{success: false, error}` (loose payloads).
 * Results are safe-parsed against the declared schema; on success both a JSON
 * `text` block **and** `structuredContent` ship; on drift `structuredContent`
 * is omitted but text still ships. Handled failures and thrown errors both
 * surface as `isError: true` with the same envelope.
 */

import { z } from "zod";

import type { McpToolResult, ToolOutputSchema } from "./types";

const failureShape = z.looseObject({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
});

/**
 * Build a standard success/failure output schema from a success payload shape.
 *
 * Uses `z.looseObject()` (additionalProperties: true) matching CodFlow's
 * `toolOutput()` contract: declared fields are validated and documented for
 * the model; undeclared fields pass through instead of failing the whole
 * result. A row-shape change can never silently strip a tool's structured
 * output.
 */
export function toolOutput<T extends z.ZodType<Record<string, unknown>>>(
  successShape: T,
): ToolOutputSchema {
  return { success: successShape, failure: failureShape };
}

/**
 * Build a loose output schema from a raw Zod shape (CodFlow pattern).
 * The success payload is a `z.looseObject()` — additional fields pass through.
 */
export function toolOutputFromShape(payload: z.ZodRawShape): ToolOutputSchema {
  const zod = z;
  return {
    success: zod.looseObject({
      success: zod.literal(true),
      ...payload,
    }),
    failure: failureShape,
  };
}

/**
 * Safe-parse a tool result against its declared output schema.
 *
 * Returns `structuredContent` only when the result passes the schema.
 * On drift, `structuredContent` is omitted but `text` still ships.
 */
export function safeParseToolResult(
  raw: unknown,
  outputSchema: ToolOutputSchema | undefined,
): McpToolResult {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);

  if (!outputSchema) {
    return { text };
  }

  const successParsed = outputSchema.success.safeParse(raw);
  if (successParsed.success) {
    return { text, structuredContent: successParsed.data, isError: false };
  }

  const failureParsed = outputSchema.failure.safeParse(raw);
  if (failureParsed.success) {
    return { text, structuredContent: failureParsed.data, isError: true };
  }

  // Schema drift: text ships, structuredContent omitted.
  // Log loudly so drift is visible in development (CodFlow convention).
  console.error(
    `[mcp] structuredContent validation failed — result does not match its output schema (omitting structuredContent):`,
    successParsed.error?.issues
      ?.slice(0, 5)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; "),
  );
  return { text, isError: false };
}

/**
 * Wrap a thrown error into the standard failure envelope.
 */
export function errorToolResult(error: unknown): McpToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;

  const envelope: Record<string, unknown> = {
    success: false,
    error: message,
    ...(code ? { code } : {}),
  };

  return {
    text: JSON.stringify(envelope, null, 2),
    structuredContent: envelope,
    isError: true,
  };
}

/**
 * Build a successful tool result from data.
 */
export function successToolResult(data: Record<string, unknown>): McpToolResult {
  const envelope = { success: true, ...data };
  return {
    text: JSON.stringify(envelope, null, 2),
    structuredContent: envelope,
    isError: false,
  };
}
