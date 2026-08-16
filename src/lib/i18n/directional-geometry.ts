export type TextDirection = "ltr" | "rtl";
export type LogicalInlineSide = "start" | "end";
export type PhysicalInlineSide = "left" | "right";
export type PhysicalPanelSide = "top" | "right" | "bottom" | "left";
export type SemanticPanelSide = PhysicalPanelSide | LogicalInlineSide;

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

/**
 * Resolve only logical start/end panel placement. Explicit physical sides remain
 * invariant across locales, which prevents RTL support from silently changing a
 * caller that genuinely means the left, right, top or bottom edge of the screen.
 */
export function resolvePanelSide(
  side: SemanticPanelSide,
  direction: TextDirection,
): PhysicalPanelSide {
  return side === "start" || side === "end"
    ? resolveInlineSide(side, direction)
    : side;
}
