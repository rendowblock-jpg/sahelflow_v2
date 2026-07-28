import { describe, expect, it } from "vitest";

import type { BusinessCommandEnvelope } from "../contracts";
import { businessCommandRequestHash } from "../command-kernel";

function command(payload: unknown): BusinessCommandEnvelope<unknown> {
  return {
    idempotencyKey: "typed-request-identity",
    commandType: "probe.typed-request",
    aggregate: {
      type: "probe",
      id: "typed-request-aggregate",
      expectedVersion: 0,
    },
    actor: "request-hash-test",
    correlationId: "request-hash-correlation",
    payload,
  };
}

describe("businessCommandRequestHash", () => {
  it("keeps Date, bigint, undefined and negative zero distinct from lookalike values", () => {
    const instant = "2026-07-28T03:00:00.000Z";

    expect(
      businessCommandRequestHash(command({ value: new Date(instant) })),
    ).not.toBe(
      businessCommandRequestHash(command({ value: instant })),
    );
    expect(
      businessCommandRequestHash(command({ value: 42n })),
    ).not.toBe(
      businessCommandRequestHash(command({ value: "42" })),
    );
    expect(
      businessCommandRequestHash(command({ value: undefined })),
    ).not.toBe(
      businessCommandRequestHash(command({})),
    );
    expect(
      businessCommandRequestHash(command({ value: -0 })),
    ).not.toBe(
      businessCommandRequestHash(command({ value: 0 })),
    );
  });

  it("remains deterministic across plain-object key order", () => {
    expect(
      businessCommandRequestHash(command({ alpha: 1, nested: { beta: true, gamma: "x" } })),
    ).toBe(
      businessCommandRequestHash(command({ nested: { gamma: "x", beta: true }, alpha: 1 })),
    );
  });

  it("orders canonically equivalent Unicode spellings by code unit, not locale", () => {
    const composed = "\u00e9";
    const decomposed = "e\u0301";
    const first = Object.fromEntries([
      [composed, "composed"],
      [decomposed, "decomposed"],
    ]);
    const second = Object.fromEntries([
      [decomposed, "decomposed"],
      [composed, "composed"],
    ]);

    expect(businessCommandRequestHash(command(first))).toBe(
      businessCommandRequestHash(command(second)),
    );
  });
});
