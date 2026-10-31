// What a result code means on the phone. The NAMES are the desktop's own list (command-result-codes.ts, imported, no second list):
// the table below is typed against it, so a code added there that is not mapped here does not compile.
import { isCommandResultCode, type CommandResultCode } from "../../../../src/lib/connected-platform/command-result-codes";

// answered = the chat was already answered (from the PC or by an earlier send of this same reply): finished, NOT failed, no retry.
export type ResultUi = "done" | "review" | "answered" | "resync" | "expired" | "failed";
const UI: Readonly<Record<CommandResultCode, ResultUi>> = {
  EXPIRED: "expired", EXPIRY_TOO_LONG: "failed", REMOTE_POLICY_STALE: "resync", REMOTE_DEVICE_UNKNOWN: "failed", REMOTE_COMMAND_UNSUPPORTED: "failed",
  INVALID_PAYLOAD: "failed", PERMISSION_DENIED: "failed", NOT_FOUND: "failed",
  ORDER_ALREADY_CONFIRMED: "done", ORDER_ALREADY_CANCELLED: "done", // neutral: "already handled on your PC"
  ORDER_CHANGED: "review", // never retried by itself
  ORDER_NOT_CONFIRMABLE_HERE: "failed", ALREADY_ANSWERED: "answered", SEND_GUARD_REFUSED: "failed", ENTITY_CHANGED: "failed", REMOTE_COMMAND_REJECTED: "failed",
};
export function mapResultCode(code: string | undefined): ResultUi {
  return code !== undefined && isCommandResultCode(code) ? UI[code] : "failed";
}
