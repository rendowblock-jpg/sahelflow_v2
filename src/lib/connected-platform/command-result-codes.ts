/**
 * The codes a desktop result envelope can carry back to the phone.
 *
 * NO import of any kind: the phone app bundles this file as it is. The result
 * payload is codes and ids only, never text; the phone owns the wording.
 */
export const COMMAND_RESULT_CODES = [
  // the command itself
  "EXPIRED",
  "EXPIRY_TOO_LONG",
  "REMOTE_POLICY_STALE",
  "REMOTE_DEVICE_UNKNOWN",
  "REMOTE_COMMAND_UNSUPPORTED",
  "INVALID_PAYLOAD",
  "PERMISSION_DENIED",
  // what it points at
  "NOT_FOUND",
  "ORDER_ALREADY_CONFIRMED",
  "ORDER_ALREADY_CANCELLED",
  "ORDER_CHANGED",
  "ORDER_NOT_CONFIRMABLE_HERE",
  "ALREADY_ANSWERED",
  "SEND_GUARD_REFUSED",
  "ENTITY_CHANGED",
  // anything else the PC could not do
  "REMOTE_COMMAND_REJECTED",
] as const;

export type CommandResultCode = (typeof COMMAND_RESULT_CODES)[number];

export function isCommandResultCode(value: unknown): value is CommandResultCode {
  return typeof value === "string" && (COMMAND_RESULT_CODES as readonly string[]).includes(value);
}
