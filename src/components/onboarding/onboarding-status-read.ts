/**
 * Reads one "is it set up" answer for the onboarding checklist.
 *
 * Courier credentials and the Gemini key are read through routes that need a PIN confirmation younger than ten
 * minutes (SENSITIVE_REAUTH_WINDOW_MS). Past that window they answer 403 REAUTHENTICATION_REQUIRED. That is not
 * "not configured": the checklist must keep what it knew and ask for the PIN (lab finding F-0012).
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
