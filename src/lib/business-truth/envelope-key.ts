import "server-only";

import { randomBytes } from "node:crypto";

import {
  decryptString,
  encryptString,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";

export const BUSINESS_ENVELOPE_SECRET_KEY = "business_truth_envelope_key_v1";
const ENVELOPE_KEY_BYTES = 32;

interface EnvelopeKeySecretRow {
  ciphertext: string;
  iv: string;
  tag: string;
}

function envelopeKeyError(message: string): SahelFlowError {
  return new SahelFlowError(message, "BUSINESS_ENVELOPE_KEY", 500);
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function rowPayload(row: EnvelopeKeySecretRow): EncryptedPayload {
  return {
    ciphertext: row.ciphertext,
    iv: row.iv,
    tag: row.tag,
  };
}

function parseEnvelopeKey(value: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw envelopeKeyError("Stored business envelope key has an invalid format");
  }
  const key = Buffer.from(value, "hex");
  if (key.length !== ENVELOPE_KEY_BYTES) {
    throw envelopeKeyError("Stored business envelope key has an invalid length");
  }
  return key;
}

function decryptEnvelopeKey(row: EnvelopeKeySecretRow): Buffer {
  try {
    return parseEnvelopeKey(decryptString(rowPayload(row), getMasterKey()));
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw envelopeKeyError("Business envelope key could not be decrypted");
  }
}

async function readEnvelopeKey(
  context: ServiceContext,
): Promise<EnvelopeKeySecretRow | null> {
  return context.prisma.secret.findUnique({
    where: { key: BUSINESS_ENVELOPE_SECRET_KEY },
    select: {
      ciphertext: true,
      iv: true,
      tag: true,
    },
  });
}

/**
 * Resolve the stable purpose-specific encryption key for business command,
 * event, outbox and compensation envelopes.
 *
 * The random key is stored as a normal encrypted Secret. Master-key rotation
 * therefore re-wraps only this small secret while historical business
 * envelopes remain encrypted under the same stable key. Concurrent first use
 * is safe: one create wins and every loser reads the unique winning row.
 */
export async function getBusinessEnvelopeKey(
  context: ServiceContext,
): Promise<Buffer> {
  const existing = await readEnvelopeKey(context);
  if (existing) return decryptEnvelopeKey(existing);

  const generated = randomBytes(ENVELOPE_KEY_BYTES);
  const wrapped = encryptString(generated.toString("hex"), getMasterKey());
  try {
    await context.prisma.secret.create({
      data: {
        key: BUSINESS_ENVELOPE_SECRET_KEY,
        ...wrapped,
      },
    });
    return generated;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const winner = await readEnvelopeKey(context);
    if (!winner) {
      throw envelopeKeyError(
        "Concurrent business envelope key creation completed without a readable winner",
      );
    }
    return decryptEnvelopeKey(winner);
  }
}
