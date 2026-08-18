export type CanonicalInboxMessageDirection = "inbound" | "outbound" | "system";

/**
 * Older SahelFlow databases and representative evidence used
 * `incoming`/`outgoing`, while current provider/domain paths use
 * `inbound`/`outbound`. Normalize at the server projection boundary so legacy
 * history cannot silently render on the wrong side of the conversation.
 */
export function normalizeInboxMessageDirection(
  direction: string,
): CanonicalInboxMessageDirection {
  const normalized = direction.trim().toLowerCase();
  if (normalized === "inbound" || normalized === "incoming") return "inbound";
  if (normalized === "system") return "system";
  return "outbound";
}
