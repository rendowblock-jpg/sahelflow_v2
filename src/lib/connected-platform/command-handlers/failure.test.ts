import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ConflictError, NotFoundError, SahelFlowError, ValidationError } from "@/types/errors";
import { commandFailure } from "./failure";

describe("commandFailure: every error becomes one code from the closed list", () => {
  it("maps the known ones", () => {
    const zodError = (() => { try { z.object({ a: z.string() }).parse({}); } catch (e) { return e; } })();
    expect(commandFailure(zodError)).toEqual({ state: "rejected", result: { code: "INVALID_PAYLOAD" } });
    expect(commandFailure(new NotFoundError("Order", "x"))).toEqual({ state: "rejected", result: { code: "NOT_FOUND" } });
    expect(commandFailure(new ConflictError("version"))).toEqual({ state: "conflict", result: { code: "ENTITY_CHANGED" } });
    expect(commandFailure(new SahelFlowError("x", "ORDER_CHANGED", 409))).toEqual({ state: "conflict", result: { code: "ORDER_CHANGED" } });
    expect(commandFailure(new SahelFlowError("x", "SEND_GUARD_REFUSED", 429))).toEqual({ state: "rejected", result: { code: "SEND_GUARD_REFUSED" } });
    expect(commandFailure(new SahelFlowError("x", "FORBIDDEN", 403))).toEqual({ state: "rejected", result: { code: "PERMISSION_DENIED" } });
    expect(commandFailure(new ValidationError("x"))).toEqual({ state: "rejected", result: { code: "INVALID_PAYLOAD" } });
  });

  it("turns the opener's expiry error into EXPIRED", () => {
    expect(commandFailure(new Error("Connected envelope has expired"))).toEqual({ state: "rejected", result: { code: "EXPIRED" } });
  });

  it("never lets free text through", () => {
    const failed = commandFailure(new Error("Customer Karim 0555123456 was not found"));
    expect(failed).toEqual({ state: "rejected", result: { code: "REMOTE_COMMAND_REJECTED" } });
    expect(JSON.stringify(commandFailure(new SahelFlowError("Karim 0555", "WEIRD", 500)))).not.toContain("Karim");
  });
});
