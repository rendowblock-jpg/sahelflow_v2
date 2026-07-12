/**
 * W3-21: Lightweight zod → JSON Schema converter.
 *
 * SahelFlow's AI chat tools declare BOTH:
 *   1. A zod schema (used by `execute()` to validate params)
 *   2. A hand-written JSON schema (sent to Gemini as `functionDeclarations`)
 *
 * These can drift: a developer adds a field to the zod schema but forgets
 * to update the JSON schema (or vice versa), and Gemini starts calling the
 * tool with the wrong arg shape.
 *
 * This helper converts a zod schema to a JSON schema so the two can be
 * compared in tests (see `__tests__/schema-drift.test.ts`).
 *
 * Implementation: zod v4 ships a built-in `toJSONSchema()` method on every
 * schema. We wrap it + normalize the output to match the style used in
 * SahelFlow's hand-written tool definitions:
 *   - Strip `$schema` (self-describing prop, not used by Gemini)
 *   - Strip `additionalProperties` (Gemini ignores it)
 *   - Strip `minimum` / `maximum` / `minItems` / `maxItems` (informational
 *     constraints not present in the hand-written schemas)
 *   - Normalize `type: "integer"` → `type: "number"` (the hand-written
 *     schemas use "number" for both ints and floats — Gemini treats them
 *     the same)
 *
 * Descriptions (from `.describe()`) ARE preserved — they're part of the
 * contract Gemini sees.
 */
import type { z } from "zod";

// zod v4 schemas have a `.toJSONSchema()` method. We access it via a cast
// to avoid coupling to zod's internal type names (which changed between
// v3 and v4 and may change again).
interface ZodSchemaWithToJsonSchema {
  toJSONSchema(): unknown;
}

/**
 * Convert a zod schema to a JSON schema object, normalized to match the
 * style of SahelFlow's hand-written tool definitions.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const raw = (schema as unknown as ZodSchemaWithToJsonSchema).toJSONSchema();
  if (raw === null || typeof raw !== "object") {
    throw new Error(
      `zodToJsonSchema: zod's toJSONSchema() returned a non-object (${typeof raw}). ` +
        `The schema may be malformed or use an unsupported zod feature.`,
    );
  }
  return normalize(raw) as Record<string, unknown>;
}

/**
 * Recursively normalize a JSON schema node:
 *   - Strip keys not used in hand-written schemas
 *   - Convert "integer" → "number"
 */
function normalize(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(normalize);
  }
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      // Strip self-describing + informational keys not present in the
      // hand-written schemas. This keeps the drift test focused on
      // structural shape (property names + types + required).
      if (
        key === "$schema" ||
        key === "additionalProperties" ||
        key === "minimum" ||
        key === "maximum" ||
        key === "exclusiveMinimum" ||
        key === "exclusiveMaximum" ||
        key === "minItems" ||
        key === "maxItems" ||
        key === "minLength" ||
        key === "maxLength" ||
        key === "pattern" ||
        key === "default" ||
        key === "const"
      ) {
        continue;
      }
      // The hand-written schemas use "number" for both ints and floats.
      if (key === "type" && value === "integer") {
        out[key] = "number";
        continue;
      }
      out[key] = normalize(value);
    }
    return out;
  }
  return node;
}
