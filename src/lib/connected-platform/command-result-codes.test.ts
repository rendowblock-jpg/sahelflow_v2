import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { COMMAND_RESULT_CODES, isCommandResultCode } from "./command-result-codes";

describe("command result codes", () => {
  it("lists every code the phone has to explain, once each", () => {
    expect([...COMMAND_RESULT_CODES].sort()).toEqual([
      "ALREADY_ANSWERED",
      "ENTITY_CHANGED",
      "EXPIRED",
      "EXPIRY_TOO_LONG",
      "INVALID_PAYLOAD",
      "NOT_FOUND",
      "ORDER_ALREADY_CANCELLED",
      "ORDER_ALREADY_CONFIRMED",
      "ORDER_CHANGED",
      "ORDER_NOT_CONFIRMABLE_HERE",
      "PERMISSION_DENIED",
      "REMOTE_COMMAND_REJECTED",
      "REMOTE_COMMAND_UNSUPPORTED",
      "REMOTE_DEVICE_UNKNOWN",
      "REMOTE_POLICY_STALE",
      "SEND_GUARD_REFUSED",
    ]);
    expect(new Set(COMMAND_RESULT_CODES).size).toBe(COMMAND_RESULT_CODES.length);
  });

  it("recognises a code and refuses free text", () => {
    expect(isCommandResultCode("EXPIRED")).toBe(true);
    expect(isCommandResultCode("Order 12 is already confirmed")).toBe(false);
    expect(isCommandResultCode(undefined)).toBe(false);
  });

  it("has no import at all, so the phone and the relay can bundle it", () => {
    const source = readFileSync(join(__dirname, "command-result-codes.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});
