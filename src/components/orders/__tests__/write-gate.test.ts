import { describe, expect, it } from "vitest";

import { resolveWriteGate } from "@/components/orders/write-gate";

describe("resolveWriteGate: when a write control must be off", () => {
  it("online and allowed: on, no reason", () => {
    expect(resolveWriteGate({ online: true, allowed: true })).toEqual({ disabled: false, reason: null });
  });
  it("offline and allowed: off, because of the connection", () => {
    expect(resolveWriteGate({ online: false, allowed: true })).toEqual({ disabled: true, reason: "offline" });
  });
  it("online but not allowed: off, because of the permission", () => {
    expect(resolveWriteGate({ online: true, allowed: false })).toEqual({ disabled: true, reason: "forbidden" });
  });
  it("offline and not allowed: the permission wins (coming back online would not help)", () => {
    expect(resolveWriteGate({ online: false, allowed: false })).toEqual({ disabled: true, reason: "forbidden" });
  });
});
