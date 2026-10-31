import { ZodError } from "zod";
import { SahelFlowError } from "@/types/errors";
import { isCommandResultCode, type CommandResultCode } from "../command-result-codes";

export type CommandFailure = Readonly<{
  state: "rejected" | "conflict";
  result: Readonly<{ code: CommandResultCode }>;
}>;

function failure(state: CommandFailure["state"], code: CommandResultCode): CommandFailure {
  return Object.freeze({ state, result: Object.freeze({ code }) });
}

/** Whatever went wrong becomes one code from the closed list: the phone never gets free text. */
export function commandFailure(error: unknown): CommandFailure {
  if (error instanceof ZodError) return failure("rejected", "INVALID_PAYLOAD");
  if (error instanceof SahelFlowError) {
    const conflict = error.statusCode === 409;
    if (isCommandResultCode(error.code)) return failure(conflict ? "conflict" : "rejected", error.code);
    if (conflict) return failure("conflict", "ENTITY_CHANGED");
    if (error.statusCode === 404) return failure("rejected", "NOT_FOUND");
    if (error.statusCode === 400) return failure("rejected", "INVALID_PAYLOAD");
    if (error.statusCode === 401 || error.statusCode === 403) return failure("rejected", "PERMISSION_DENIED");
    return failure("rejected", "REMOTE_COMMAND_REJECTED");
  }
  // openConnectedEnvelope throws a plain Error when the command ran out of time.
  if (error instanceof Error && /envelope has expired/i.test(error.message)) {
    return failure("rejected", "EXPIRED");
  }
  return failure("rejected", "REMOTE_COMMAND_REJECTED");
}
