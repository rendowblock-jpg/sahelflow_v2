/** Client call of the owner's "Discard" on a held WhatsApp send. Never throws. */
export type HeldDiscardOutcome =
  | { ok: true; alreadyDiscarded: boolean }
  | { ok: false; status: number; code: string | null; message: string | null };

/** What the held-send box shows while a discard runs or after it failed. */
export type HeldDiscardUiStatus =
  | { effectKey: string; status: "discarding" }
  | { effectKey: string; status: "failed"; reason: string };

export async function postHeldDiscard(
  effectKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HeldDiscardOutcome> {
  try {
    const response = await fetchImpl(
      `/api/whatsapp/outbox/${encodeURIComponent(effectKey)}/discard-held`,
      { method: "POST", cache: "no-store" },
    );
    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      alreadyDiscarded?: boolean;
      code?: string;
      error?: string;
    } | null;
    // A 200 is trusted only when the route says ok: a proxy page must not read as a discard.
    if (response.ok && data?.ok === true) {
      return { ok: true, alreadyDiscarded: data.alreadyDiscarded === true };
    }
    return {
      ok: false,
      status: response.status,
      code: data?.code ?? null,
      message: data?.error ?? null,
    };
  } catch {
    return { ok: false, status: 0, code: null, message: null };
  }
}
