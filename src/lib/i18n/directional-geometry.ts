export type TextDirection = "ltr" | "rtl";
export type LogicalInlineSide = "start" | "end";
export type PhysicalInlineSide = "left" | "right";

/**
 * Resolve a semantic inline side without redefining intentionally physical
 * geometry. Shared primitives can opt into start/end when their placement
 * follows reading direction while still preserving explicit left/right APIs.
 */
export function resolveInlineSide(
  side: LogicalInlineSide,
  direction: TextDirection,
): PhysicalInlineSide {
  if (side === "start") {
    return direction === "rtl" ? "right" : "left";
  }

  return direction === "rtl" ? "left" : "right";
}
