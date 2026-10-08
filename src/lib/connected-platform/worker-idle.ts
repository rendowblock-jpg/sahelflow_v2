import { SahelFlowError } from "@/types/errors";

/**
 * Connected workers poll a cloud channel that most installations have not
 * enrolled in (no storefront connected, no remote devices) or are not
 * entitled to (trial without the capability, expired licence). That is the
 * normal resting state, not a failure: logging it as a warning every five
 * seconds filled the seller's log and kept a low-end disk busy for nothing.
 *
 * An idle worker polls slowly and says so once; genuine relay failures keep
 * their classified warnings and escalation.
 */
export const IDLE_POLL_INTERVAL_MS = 60_000;

export const NOT_ENROLLED_MESSAGE = "Connected command authority is not enrolled";

export function isConnectedIdleState(error: unknown): boolean {
  if (error instanceof SahelFlowError) {
    return (
      error.code === "CONNECTED_PLATFORM_NOT_ENROLLED" ||
      error.code === "LICENSE_FEATURE_DENIED" ||
      error.code.startsWith("LICENSE_")
    );
  }
  return error instanceof Error && error.message === NOT_ENROLLED_MESSAGE;
}
