import "server-only";

import { randomBytes } from "node:crypto";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  createSecretIfAbsent,
  getSecret,
} from "@/lib/secrets";
import { SahelFlowError } from "@/types/errors";

export const BUSINESS_ENVELOPE_SECRET_KEY = "business_truth_envelope_key_v1";
const ENVELOPE_KEY_BYTES = 32;

function envelopeKeyError(message: string): SahelFlowError {
  return new SahelFlowError(message, "BUSINESS_ENVELOPE_KEY", 500);
}

function parseEnvelopeKey(value: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw envelopeKeyError("Stored business envelope key has an invalid format");
  }
  const key = Buffer.from(value, "hex");
  if (key.length !== ENVELOPE_KEY_BYTES) {
    key.fill(0);
    throw envelopeKeyError("Stored business envelope key has an invalid length");
  }
  return key;
}

/**
 * Resolve the stable random key for business command/event/outbox envelopes.
 *
 * The key is stored through the canonical shop-secret authority. Concurrent
 * first use is safe: one create wins; every loser discards its candidate and
 * opens the unique authenticated winner. Installation-root rotation therefore
 * re-wraps only the shop-secret key, not historical business payloads.
 */
export async function getBusinessEnvelopeKey(
  context: ServiceContext,
): Promise<Buffer> {
  const existing = await getSecret(context, BUSINESS_ENVELOPE_SECRET_KEY);
  if (existing !== null) return parseEnvelopeKey(existing);

  const generated = randomBytes(ENVELOPE_KEY_BYTES);
  const generatedHex = generated.toString("hex");
  const created = await createSecretIfAbsent(
    context,
    BUSINESS_ENVELOPE_SECRET_KEY,
    generatedHex,
  );
  if (created) return generated;

  generated.fill(0);
  const winner = await getSecret(context, BUSINESS_ENVELOPE_SECRET_KEY);
  if (winner === null) {
    throw envelopeKeyError(
      "Concurrent business envelope key creation completed without a readable winner",
    );
  }
  return parseEnvelopeKey(winner);
}
