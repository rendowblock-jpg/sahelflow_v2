const INSTALL_KEY = Symbol.for("sahelflow.whatsapp.send-recovery.v1");

type RecoveryGlobal = typeof globalThis & {
  [INSTALL_KEY]?: boolean;
};

interface SendRequestBody {
  clientMessageId?: string;
}

interface EffectRecovery {
  effect?: {
    effectKey: string;
    messageId: string | null;
    providerMessageId: string | null;
    state: "queued" | "processing" | "retrying" | "succeeded" | "ambiguous" | "dead_letter";
    attemptCount: number;
    nextAttemptAt: string | null;
    errorCode: string | null;
    requiresDuplicateConfirmation: boolean;
  };
}

function isWhatsAppSend(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST") return false;
  const raw = input instanceof Request ? input.url : String(input);
  try {
    return new URL(raw, window.location.origin).pathname === "/api/whatsapp/send";
  } catch {
    return false;
  }
}

function parseMessageId(init?: RequestInit): string | null {
  if (typeof init?.body !== "string") return null;
  try {
    const body = JSON.parse(init.body) as SendRequestBody;
    return typeof body.clientMessageId === "string" ? body.clientMessageId : null;
  } catch {
    return null;
  }
}

function recoveredResponse(effect: NonNullable<EffectRecovery["effect"]>): Response {
  const succeeded = effect.state === "succeeded";
  const accepted =
    succeeded ||
    effect.state === "queued" ||
    effect.state === "processing" ||
    effect.state === "retrying";
  return Response.json(
    {
      ok: succeeded,
      accepted,
      replayed: true,
      id: effect.providerMessageId,
      messageId: effect.messageId,
      effectKey: effect.effectKey,
      state: effect.state,
      attemptCount: effect.attemptCount,
      nextAttemptAt: effect.nextAttemptAt,
      errorCode: effect.errorCode,
      requiresDuplicateConfirmation: effect.requiresDuplicateConfirmation,
    },
    { status: succeeded ? 200 : accepted ? 202 : 409 },
  );
}

/**
 * Install one narrowly scoped fetch recovery boundary for the inbox send route.
 * A lost HTTP response is replayed with the exact same clientMessageId. If the
 * response remains unavailable, the durable outbox is queried by that ID before
 * the UI is allowed to present a failure that could tempt a duplicate send.
 */
export function installWhatsAppSendRecovery(): void {
  if (typeof window === "undefined") return;
  const recoveryGlobal = globalThis as RecoveryGlobal;
  if (recoveryGlobal[INSTALL_KEY]) return;
  recoveryGlobal[INSTALL_KEY] = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isWhatsAppSend(input, init)) return originalFetch(input, init);

    let firstError: unknown;
    for (const delay of [0, 250, 750]) {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        return await originalFetch(input, init);
      } catch (error) {
        firstError ??= error;
      }
    }

    const messageId = parseMessageId(init);
    if (messageId) {
      try {
        const status = await originalFetch(
          `/api/whatsapp/outbox?messageId=${encodeURIComponent(messageId)}`,
          { cache: "no-store" },
        );
        if (status.ok) {
          const recovered = (await status.json()) as EffectRecovery;
          if (recovered.effect) return recoveredResponse(recovered.effect);
        }
      } catch {
        // Preserve the original transport failure below.
      }
    }

    throw firstError instanceof Error
      ? firstError
      : new Error("WhatsApp send response could not be recovered");
  };
}