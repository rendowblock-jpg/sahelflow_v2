import { NextResponse } from "next/server";

import { SEND_GUARD_REFUSED_CODE, WhatsAppSendGuardError } from "./send-guard";

/** 429 body the inbox composer reads: code, reason and how long the chat is paused. */
export function sendGuardRefusalResponse(error: WhatsAppSendGuardError): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      accepted: false,
      error: error.message,
      code: SEND_GUARD_REFUSED_CODE,
      errorCode: SEND_GUARD_REFUSED_CODE,
      reason: error.reason,
      retryAfterSeconds: error.retryAfterSeconds,
    },
    { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
  );
}

/** Wrap a send route handler (inside withErrorHandler) so a refused send answers 429 with the pause. */
export function withSendGuardRefusal<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof WhatsAppSendGuardError) return sendGuardRefusalResponse(error);
      throw error;
    }
  };
}
