import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import { SahelFlowError } from "@/types/errors";

const FORMAT = "sahelflow-business-command-result" as const;
const VERSION = 1 as const;
const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const PURPOSE = "sahelflow:business-command-result:v1";

export interface BusinessCommandResultBinding {
  commandId: string;
  idempotencyKey: string;
  requestHash: string;
}

interface StoredResultEnvelope {
  format: typeof FORMAT;
  version: typeof VERSION;
  algorithm: typeof ALGORITHM;
  iv: string;
  ciphertext: string;
  tag: string;
}

type EncodedResult =
  | { kind: "null" }
  | { kind: "undefined" }
  | { kind: "boolean"; value: boolean }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "date"; value: string }
  | { kind: "bigint"; value: string }
  | { kind: "array"; value: EncodedResult[] }
  | { kind: "object"; value: Array<[string, EncodedResult]> };

function codecError(message: string): SahelFlowError {
  return new SahelFlowError(message, "BUSINESS_COMMAND_RESULT_CODEC", 500);
}

function deriveResultKey(envelopeKey: Buffer): Buffer {
  if (envelopeKey.length !== 32) {
    throw codecError("Business command result encryption requires a 32-byte envelope key");
  }
  return createHmac("sha256", envelopeKey).update(PURPOSE, "utf8").digest();
}

function bindingBytes(binding: BusinessCommandResultBinding): Buffer {
  return Buffer.from(
    JSON.stringify({
      format: FORMAT,
      version: VERSION,
      commandId: binding.commandId,
      idempotencyKey: binding.idempotencyKey,
      requestHash: binding.requestHash,
    }),
    "utf8",
  );
}

function encodeResult(value: unknown, active: WeakSet<object>): EncodedResult {
  if (value === null) return { kind: "null" };
  if (value === undefined) return { kind: "undefined" };
  if (typeof value === "boolean") return { kind: "boolean", value };
  if (typeof value === "string") return { kind: "string", value };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw codecError("Business command results cannot contain non-finite numbers");
    }
    return { kind: "number", value };
  }
  if (typeof value === "bigint") {
    return { kind: "bigint", value: value.toString() };
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw codecError("Business command results cannot contain invalid dates");
    }
    return { kind: "date", value: value.toISOString() };
  }
  if (typeof value !== "object") {
    throw codecError(`Unsupported business command result value: ${typeof value}`);
  }

  if (active.has(value)) {
    throw codecError("Business command results cannot contain circular references");
  }
  active.add(value);
  try {
    if (Array.isArray(value)) {
      return {
        kind: "array",
        value: value.map((entry) => encodeResult(entry, active)),
      };
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw codecError("Business command results must use plain objects, arrays, dates, and scalar values");
    }

    return {
      kind: "object",
      value: Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, encodeResult(entry, active)]),
    };
  } finally {
    active.delete(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeResult(value: unknown): unknown {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw codecError("Stored business command result has an invalid tagged value");
  }

  switch (value.kind) {
    case "null":
      return null;
    case "undefined":
      return undefined;
    case "boolean":
      if (typeof value.value !== "boolean") throw codecError("Stored boolean result is invalid");
      return value.value;
    case "number":
      if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
        throw codecError("Stored number result is invalid");
      }
      return value.value;
    case "string":
      if (typeof value.value !== "string") throw codecError("Stored string result is invalid");
      return value.value;
    case "date": {
      if (typeof value.value !== "string") throw codecError("Stored date result is invalid");
      const date = new Date(value.value);
      if (Number.isNaN(date.getTime()) || date.toISOString() !== value.value) {
        throw codecError("Stored date result is invalid");
      }
      return date;
    }
    case "bigint":
      if (typeof value.value !== "string" || !/^-?\d+$/.test(value.value)) {
        throw codecError("Stored bigint result is invalid");
      }
      return BigInt(value.value);
    case "array":
      if (!Array.isArray(value.value)) throw codecError("Stored array result is invalid");
      return value.value.map(decodeResult);
    case "object": {
      if (!Array.isArray(value.value)) throw codecError("Stored object result is invalid");
      const output: Record<string, unknown> = {};
      for (const entry of value.value) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") {
          throw codecError("Stored object entry is invalid");
        }
        if (Object.prototype.hasOwnProperty.call(output, entry[0])) {
          throw codecError("Stored object result contains a duplicate key");
        }
        Object.defineProperty(output, entry[0], {
          value: decodeResult(entry[1]),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return output;
    }
    default:
      throw codecError("Stored business command result uses an unsupported tag");
  }
}

function parseEnvelope(resultJson: string): StoredResultEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultJson);
  } catch {
    throw codecError("Stored business command result envelope is malformed");
  }
  if (
    !isRecord(parsed) ||
    parsed.format !== FORMAT ||
    parsed.version !== VERSION ||
    parsed.algorithm !== ALGORITHM ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.tag !== "string"
  ) {
    throw codecError("Stored business command result envelope is unsupported or malformed");
  }
  return parsed as unknown as StoredResultEnvelope;
}

export function sealBusinessCommandResultWithKey<TResult>(
  result: TResult,
  binding: BusinessCommandResultBinding,
  envelopeKey: Buffer,
): { resultJson: string; normalizedResult: TResult } {
  const encoded = encodeResult(result, new WeakSet<object>());
  const plaintext = JSON.stringify(encoded);
  const key = deriveResultKey(envelopeKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(bindingBytes(binding));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const envelope: StoredResultEnvelope = {
    format: FORMAT,
    version: VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };

  return {
    resultJson: JSON.stringify(envelope),
    normalizedResult: decodeResult(JSON.parse(plaintext)) as TResult,
  };
}

export function openBusinessCommandResultWithKey<TResult>(
  resultJson: string,
  binding: BusinessCommandResultBinding,
  envelopeKey: Buffer,
): TResult {
  const envelope = parseEnvelope(resultJson);
  try {
    const key = deriveResultKey(envelopeKey);
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    if (iv.length !== IV_LENGTH || tag.length !== 16) {
      throw new Error("invalid authenticated-encryption dimensions");
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(bindingBytes(binding));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return decodeResult(JSON.parse(plaintext)) as TResult;
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw codecError("Stored business command result failed authentication or decoding");
  }
}
