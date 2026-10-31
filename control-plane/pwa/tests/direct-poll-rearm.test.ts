// W3b F6a: a good answer (the phone was paired again) re-arms the direct poll: a LATER revoke wipes and shows the revoked screen again.
// Kills mutant D6 ("never re-armed"): without the reset a second revoke would be swallowed by the first one's finished wipe.
import { describe, expect, it } from "vitest";
import { createDirectPoll } from "../src/app/direct-poll";
import type { RelayPoll } from "../src/today/relay-source";

const REVOKED = { kind: "revoked" } as unknown as RelayPoll;
const UPDATED = { kind: "updated" } as unknown as RelayPoll;
const UNCHANGED = { kind: "unchanged" } as unknown as RelayPoll;

function rig(answers: RelayPoll[]) {
  let wipes = 0; const shown: string[] = [];
  const queue = [...answers];
  const poll = createDirectPoll({
    poll: async () => queue.shift() ?? UNCHANGED,
    wipe: async () => { wipes += 1; return { ok: true, steps: [] }; },
    onRevoked: (r) => { shown.push(r.wiped ? "wiped" : "not-wiped"); },
  });
  return { poll, wipes: () => wipes, shown };
}

describe("the direct poll re-arms after a good answer", () => {
  it("revoked, then updated (paired again), then revoked again: the wipe and the revoked screen happen TWICE", async () => {
    const r = rig([REVOKED, UPDATED, REVOKED]);
    await expect(r.poll("orders")).rejects.toThrow("revoked");
    expect(r.wipes()).toBe(1); expect(r.shown).toEqual(["wiped"]);
    expect(await r.poll("orders")).toBe(UPDATED);
    await expect(r.poll("orders")).rejects.toThrow("revoked");
    expect(r.wipes()).toBe(2); expect(r.shown).toEqual(["wiped", "wiped"]);
  });
  it("two revoked answers in a row without a good one between share the first wipe (no double wipe)", async () => {
    const r = rig([REVOKED, REVOKED]);
    await expect(r.poll("conversations")).rejects.toThrow("revoked");
    await expect(r.poll("conversations")).rejects.toThrow("revoked");
    expect(r.wipes()).toBe(1); expect(r.shown).toEqual(["wiped"]);
  });
});
