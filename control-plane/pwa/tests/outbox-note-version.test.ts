// A note enqueued straight from submitNote carries its thread version in target.expectedVersion (helper w174's finding).
// The sealed payload must carry it too, or the PC answers a version conflict. Parsed with the DESKTOP's own schema.
import { describe, expect, it } from "vitest";
import { commentPayload } from "../../../src/lib/connected-platform/command-handlers/notes";
import { createOutbox, payloadOf, type OutboxDeps } from "../src/outbox/outbox";
import { NOW, memDb } from "./orders-fixtures";

const target = { type: "order" as const, id: "ord_00000001", expectedVersion: 4 };
const note = { kind: "command.comments.write" as const, target, draftText: "Call him at 5" };

describe("note version in the sealed payload", () => {
  it("payloadOf takes the version from the target when extra has none", () => {
    expect(commentPayload.parse(payloadOf(note)).expectedVersion).toBe(4);
  });
  it("extra.expectedVersion still wins over the target", () => {
    expect(commentPayload.parse(payloadOf({ ...note, extra: { expectedVersion: 9 } })).expectedVersion).toBe(9);
  });
  it("a thread the phone has not seen yet (no version anywhere) is 0", () => {
    expect(commentPayload.parse(payloadOf({ ...note, target: { type: "conversation", id: "conv_0000001" } })).expectedVersion).toBe(0);
  });
  it("end to end: enqueue(submitNote's input) seals a payload the desktop schema reads with version 4", async () => {
    let sealed: unknown = null;
    const deps: OutboxDeps = {
      db: memDb(), now: () => NOW, deviceId: "phone_pwa_0001", newId: (() => { let n = 0; return () => `id_${String((n += 1)).padStart(8, "0")}`; })(), policyVersion: () => 1,
      seal: async (i) => { sealed = i.payload; return "{}"; }, post: async () => ({ status: 503, body: null }), status: async () => ({ status: 503, body: null }),
      openResult: async () => ({ ok: false, reason: "malformed" } as never),
    };
    const r = await createOutbox(deps).enqueue({ ...note, labelForUi: "Call", extra: {} });
    expect(r.ok).toBe(true);
    expect(commentPayload.parse(sealed)).toMatchObject({ entityType: "order", entityId: "ord_00000001", body: "Call him at 5", expectedVersion: 4 });
  });
});
