import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  openBusinessCommandResultWithKey,
  sealBusinessCommandResultWithKey,
} from "../result-codec";

const binding = {
  commandId: "prototype-command",
  idempotencyKey: "prototype-idempotency",
  requestHash: "f".repeat(64),
};

function dangerousResult(): Record<string, unknown> {
  const value: Record<string, unknown> = { safe: true };
  Object.defineProperty(value, "__proto__", {
    value: { polluted: "no" },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  return value;
}

function expectSafe(value: Record<string, unknown>): void {
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(Object.prototype.hasOwnProperty.call(value, "__proto__")).toBe(true);
  expect(value.__proto__).toEqual({ polluted: "no" });
  expect(({} as { polluted?: string }).polluted).toBeUndefined();
}

describe("business command result object decoding", () => {
  it("materializes dangerous keys as own data properties without invoking prototype setters", () => {
    const envelopeKey = randomBytes(32);
    const sealed = sealBusinessCommandResultWithKey(
      dangerousResult(),
      binding,
      envelopeKey,
    );
    const reopened = openBusinessCommandResultWithKey<Record<string, unknown>>(
      sealed.resultJson,
      binding,
      envelopeKey,
    );

    expectSafe(sealed.normalizedResult);
    expectSafe(reopened);
  });
});
