import "server-only";

import { SahelFlowError } from "@/types/errors";

type TaggedRequestValue =
  | readonly ["null"]
  | readonly ["undefined"]
  | readonly ["boolean", boolean]
  | readonly ["number", string]
  | readonly ["string", string]
  | readonly ["date", string]
  | readonly ["bigint", string]
  | readonly ["array", readonly TaggedRequestValue[]]
  | readonly ["object", readonly (readonly [string, TaggedRequestValue])[]];

function requestCodecError(message: string): SahelFlowError {
  return new SahelFlowError(message, "INVALID_COMMAND_PAYLOAD", 400);
}

/**
 * Compare JavaScript strings by UTF-16 code unit without locale collation.
 *
 * `localeCompare` can treat distinct Unicode spellings as equal and may vary
 * across runtime locales. Canonical request and audit evidence must instead use
 * one process-independent total ordering.
 */
export function compareCanonicalKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function encodeRequest(
  value: unknown,
  active: WeakSet<object>,
): TaggedRequestValue {
  if (value === null) return ["null"];
  if (value === undefined) return ["undefined"];
  if (typeof value === "boolean") return ["boolean", value];
  if (typeof value === "string") return ["string", value];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw requestCodecError(
        "Business command payload contains a non-finite number",
      );
    }
    return ["number", Object.is(value, -0) ? "-0" : value.toString()];
  }
  if (typeof value === "bigint") {
    return ["bigint", value.toString()];
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw requestCodecError("Business command payload contains an invalid date");
    }
    return ["date", value.toISOString()];
  }
  if (typeof value !== "object") {
    throw requestCodecError(
      `Unsupported business command payload value: ${typeof value}`,
    );
  }

  if (active.has(value)) {
    throw requestCodecError(
      "Business command payload cannot contain circular references",
    );
  }
  active.add(value);
  try {
    if (Array.isArray(value)) {
      return ["array", value.map((entry) => encodeRequest(entry, active))];
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw requestCodecError(
        "Business command payload must use plain objects, arrays, dates, and scalar values",
      );
    }

    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw requestCodecError(
        "Business command payload cannot contain symbol keys",
      );
    }

    const entries = (keys as string[])
      .sort(compareCanonicalKeys)
      .map((key): readonly [string, TaggedRequestValue] => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          descriptor === undefined ||
          descriptor.enumerable !== true ||
          !("value" in descriptor)
        ) {
          throw requestCodecError(
            "Business command payload properties must be enumerable data properties",
          );
        }
        return [key, encodeRequest(descriptor.value, active)];
      });
    return ["object", entries];
  } finally {
    active.delete(value);
  }
}

/**
 * Produce deterministic, type-preserving JSON for an idempotency request hash.
 * Date/ISO-string, bigint/decimal-string, undefined/absent, and -0/0 remain
 * distinct command content.
 */
export function canonicalBusinessRequestJson(value: unknown): string {
  return JSON.stringify(encodeRequest(value, new WeakSet<object>()));
}
