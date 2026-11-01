import { z } from "zod";

export const ingressStatusSchema = z.enum([
  "received",
  "processing",
  "retrying",
  "applied",
  "quarantined",
  "dead_letter",
  // Terminal tombstone written by permanent chat deletion; kept queryable so
  // operators can audit why an event will never apply.
  "chat_deleted",
]);

export type IngressStatus = z.infer<typeof ingressStatusSchema>;

/**
 * The `status` query of the ingress list: one state or a comma list. Spaces and
 * repeats are ignored; any unknown state throws, so a typo never turns into
 * "show everything". Several states let the recovery dock ask for the problem
 * rows only instead of the newest rows of every state.
 */
export function parseIngressStatusFilter(
  parameter: string | null,
): IngressStatus | { in: IngressStatus[] } | undefined {
  if (!parameter) return undefined;
  const parts = Array.from(
    new Set(
      parameter
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    ),
  );
  const states = (parts.length > 0 ? parts : [parameter]).map((part) =>
    ingressStatusSchema.parse(part),
  );
  const only = states[0];
  return states.length === 1 && only ? only : { in: states };
}
