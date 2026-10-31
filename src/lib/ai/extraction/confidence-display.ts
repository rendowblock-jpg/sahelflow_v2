export type ConfidenceDisplay = { kind: "none" } | { kind: "value"; value: number; selfReported: boolean };

/** What the dashboard may show: a measured number (0..1), or nothing. -1 and null mean "not measured". */
export function confidenceDisplay(value: number | null | undefined, basis?: string): ConfidenceDisplay {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return { kind: "none" };
  return { kind: "value", value: Math.min(1, value), selfReported: basis === "self-reported" };
}
