/** Client call of the owner's "Send anyway" on a held WhatsApp send. Never throws. */
export type HeldApprovalOutcome =
  | {
      ok: true;
      alreadyApproved: boolean;
      state: string;
      providerMessageId: string | null;
      errorCode: string | null;
    }
  | { ok: false; status: number; code: string | null; message: string | null };

export async function postHeldApproval(
  effectKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HeldApprovalOutcome> {
  try {
    const response = await fetchImpl(
      `/api/whatsapp/outbox/${encodeURIComponent(effectKey)}/approve-held`,
      { method: "POST", cache: "no-store" },
    );
    const data = (await response.json().catch(() => null)) as {
      alreadyApproved?: boolean;
      effect?: { state?: string; providerMessageId?: string | null; errorCode?: string | null };
      code?: string;
      error?: string;
    } | null;
    if (response.ok && data?.effect?.state) {
      return {
        ok: true,
        alreadyApproved: data.alreadyApproved === true,
        state: data.effect.state,
        providerMessageId: data.effect.providerMessageId ?? null,
        errorCode: data.effect.errorCode ?? null,
      };
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
