import { ValidationError } from "@/types/errors";

/**
 * POST /api/orders is the governed MANUAL intake: every order it creates goes
 * through createTrustedManualOrder, so it gets an idempotency key, an audit row,
 * a domain event and an outbox intent in one transaction.
 *
 * Orders from any other channel (storefront, WhatsApp, commerce sync, file
 * import, AI) are created by their own intake through createCanonicalSourceOrder.
 * A body that names another source is refused here instead of being handed to
 * the legacy order engine, which stored the caller's `source` and free-form
 * `sourceMetadata` verbatim and so could mint a row that
 * isCanonicalOrderAuthority() accepts without any BusinessCommand behind it
 * (audit finding S03a-01).
 *
 * An omitted or null source means manual, as it always has. Anything else must
 * be exactly the string "manual". The caller's value is not echoed back.
 */
export function assertManualOrderIntakeSource(body: unknown): void {
  const requested =
    body !== null && typeof body === "object"
      ? (body as { source?: unknown }).source
      : undefined;
  if (requested === undefined || requested === null || requested === "manual") {
    return;
  }
  throw new ValidationError(
    'This endpoint creates manual orders only (source "manual"); orders from other channels are created by their own governed intake',
    "source",
  );
}
