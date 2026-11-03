/**
 * Reads one "is it set up" answer for the onboarding checklist.
 *
 * Courier credentials and the Gemini key are read through routes behind requireRecentReauthentication. Since the
 * Founder's decision of 3 Nov 2026 (the sign-in PIN opens the whole app) a live session passes that gate, so these
 * reads answer 200. If one ever answers 403 REAUTHENTICATION_REQUIRED again (an explicit tighter window), that is not
 * "not configured": the checklist must keep what it knew and ask for the PIN (lab finding F-0012). A safety net now.
 */
export type SetupFlagRead =
  | { kind: "known"; value: boolean }
  | { kind: "needs-pin" };

export async function readSetupFlag(
  result: PromiseSettledResult<Response>,
  pick: (body: unknown) => boolean,
): Promise<SetupFlagRead> {
  if (result.status !== "fulfilled") return { kind: "known", value: false };
  const response = result.value;
  if (response.ok) {
    const body: unknown = await response.json().catch(() => ({}));
    return { kind: "known", value: pick(body) };
  }
  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as { code?: unknown };
    if (body.code === "REAUTHENTICATION_REQUIRED") return { kind: "needs-pin" };
  }
  return { kind: "known", value: false };
}
