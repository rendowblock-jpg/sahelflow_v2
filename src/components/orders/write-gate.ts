/**
 * Whether a write control must be off, and why. Pure: the caller passes the connection and the permission.
 * A missing permission wins over "offline": coming back online would not turn the control on.
 */
export type WriteGateReason = "offline" | "forbidden";

export interface WriteGate {
  disabled: boolean;
  reason: WriteGateReason | null;
}

export function resolveWriteGate({ online, allowed }: { online: boolean; allowed: boolean }): WriteGate {
  if (!allowed) return { disabled: true, reason: "forbidden" };
  if (!online) return { disabled: true, reason: "offline" };
  return { disabled: false, reason: null };
}
