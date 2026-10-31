import { describe, expect, it } from "vitest";

import {
  HELD_SEND_OTHER_CHATS,
  decideHeldApproval,
  decideHeldDiscard,
  heldSendView,
  isHeldOutboxIntent,
  isOwnerActor,
  projectOutboxEffectState,
} from "../held-send";
import { WHATSAPP_SEND_GUARD } from "../send-guard";

const HOLD = "SEND_GUARD_BULK_SAME_TEXT";
const STATUSES = ["queued", "processing", "retrying", "succeeded", "failed", "dead_letter"] as const;
const OUTCOMES = [null, "none", "ambiguous"] as const;
const CODES = [null, HOLD, "SIDECAR_REJECTED"] as const;

describe("held send decision table (status x outcome x code x already approved)", () => {
  for (const status of STATUSES) {
    for (const outcomeState of OUTCOMES) {
      for (const lastErrorCode of CODES) {
        const intent = { status, outcomeState, lastErrorCode };
        const held = status === "failed" && outcomeState === "none" && lastErrorCode === HOLD;
        for (const approved of [false, true]) {
          const expected = held ? "release" : approved ? "already_approved" : "not_held";
          it(`${status}/${outcomeState}/${lastErrorCode} approved=${approved} -> ${expected}`, () => {
            expect(isHeldOutboxIntent(intent)).toBe(held);
            expect(decideHeldApproval(intent, approved)).toBe(expected);
          });
        }
      }
    }
  }

  it("projects the state the inbox history route sends", () => {
    expect(projectOutboxEffectState({ status: "failed", outcomeState: "none", lastErrorCode: HOLD })).toBe("held");
    expect(projectOutboxEffectState({ status: "failed", outcomeState: "ambiguous", lastErrorCode: HOLD })).toBe("ambiguous");
    expect(projectOutboxEffectState({ status: "failed", outcomeState: "none", lastErrorCode: "SIDECAR_REJECTED" })).toBe("failed");
    // A dead-lettered row that still carries the hold code is a send the owner discarded.
    expect(projectOutboxEffectState({ status: "dead_letter", outcomeState: "none", lastErrorCode: HOLD })).toBe("discarded");
    expect(projectOutboxEffectState({ status: "dead_letter", outcomeState: "none", lastErrorCode: "SIDECAR_REJECTED" })).toBe("dead_letter");
    expect(projectOutboxEffectState({ status: "dead_letter", outcomeState: "none", lastErrorCode: null })).toBe("dead_letter");
    expect(projectOutboxEffectState({ status: "failed", outcomeState: "none", lastErrorCode: HOLD })).toBe("held");
    // The hold code alone never makes a row "discarded": only a dead-lettered one.
    for (const status of ["queued", "processing", "retrying", "succeeded"]) {
      expect(projectOutboxEffectState({ status, outcomeState: "none", lastErrorCode: HOLD })).toBe(status);
    }
    expect(projectOutboxEffectState({ status: "queued", outcomeState: null, lastErrorCode: null })).toBe("queued");
  });

  it("says 5 other chats because the policy holds the 6th", () => {
    expect(HELD_SEND_OTHER_CHATS).toBe(WHATSAPP_SEND_GUARD.automation.holdSameTextConversations - 1);
    expect(HELD_SEND_OTHER_CHATS).toBe(5);
  });
});

describe("only the shop owner may release a held send", () => {
  it.each([
    [{ kind: "compatibility_local_owner", role: "owner" }, true],
    [{ kind: "person", role: "owner" }, true],
    [{ kind: "person", role: "manager" }, false],
    [{ kind: "person", role: "operator" }, false],
    [{ kind: "person", role: "viewer" }, false],
    [{ kind: "person" }, false],
    [{ kind: "system" }, false],
    [{ kind: "system", role: "owner" }, false],
  ])("%j -> %s", (actor, expected) => {
    expect(isOwnerActor(actor)).toBe(expected);
  });
});

describe("discarding a held send (status x outcome x code x release audit x discard audit)", () => {
  for (const status of STATUSES) {
    for (const outcomeState of OUTCOMES) {
      for (const lastErrorCode of CODES) {
        const intent = { status, outcomeState, lastErrorCode };
        const held = status === "failed" && outcomeState === "none" && lastErrorCode === HOLD;
        for (const released of [false, true]) {
          for (const discarded of [false, true]) {
            // A release audit row means it may have been sent: that always wins.
            const expected = released ? "already_released" : held ? "discard" : discarded ? "already_discarded" : "not_held";
            it(`${status}/${outcomeState}/${lastErrorCode} released=${released} discarded=${discarded} -> ${expected}`, () => {
              expect(decideHeldDiscard(intent, released, discarded)).toBe(expected);
            });
          }
        }
      }
    }
  }

  it("a released send can never be discarded", () => {
    const releasedRows = [
      { status: "queued", outcomeState: "none", lastErrorCode: null },
      { status: "processing", outcomeState: "none", lastErrorCode: null },
      { status: "retrying", outcomeState: "none", lastErrorCode: "SIDECAR_UNAVAILABLE" },
      { status: "succeeded", outcomeState: "none", lastErrorCode: null },
      { status: "failed", outcomeState: "ambiguous", lastErrorCode: null },
      { status: "failed", outcomeState: "none", lastErrorCode: HOLD },
    ];
    for (const row of releasedRows) {
      expect(decideHeldDiscard(row, true, false)).toBe("already_released");
      expect(decideHeldDiscard(row, true, true)).toBe("already_released");
    }
  });

  it("a discarded send can never be released", () => {
    const discardedRow = { status: "dead_letter", outcomeState: "none", lastErrorCode: HOLD };
    expect(isHeldOutboxIntent(discardedRow)).toBe(false);
    expect(decideHeldApproval(discardedRow, false)).toBe("not_held");
    expect(decideHeldDiscard(discardedRow, false, true)).toBe("already_discarded");
  });

  it("discarding twice reports the first discard, an unknown row is not held", () => {
    const heldRow = { status: "failed", outcomeState: "none", lastErrorCode: HOLD };
    expect(decideHeldDiscard(heldRow, false, false)).toBe("discard");
    expect(decideHeldDiscard({ status: "queued", outcomeState: "none", lastErrorCode: null }, false, false)).toBe("not_held");
  });
});

describe("what the bubble offers", () => {
  const base = { direction: "outbound" as const, outboxState: "held" as const, outboxEffectKey: "wa:k" };
  it("owner gets the button, a member gets the sentence only", () => {
    expect(heldSendView(base, true)).toBe("owner_can_release");
    expect(heldSendView(base, false)).toBe("ask_owner");
  });
  it("a discarded send shows the calm line to everyone and never a button", () => {
    const discarded = { ...base, outboxState: "discarded" as const };
    expect(heldSendView(discarded, true)).toBe("discarded");
    expect(heldSendView(discarded, false)).toBe("discarded");
    expect(heldSendView({ ...discarded, direction: "inbound" }, true)).toBe("none");
    expect(heldSendView({ ...discarded, outboxEffectKey: undefined }, true)).toBe("none");
  });
  it("shows nothing for any other state, direction or a missing key", () => {
    for (const outboxState of ["queued", "processing", "retrying", "succeeded", "ambiguous", "dead_letter", undefined] as const) {
      expect(heldSendView({ ...base, outboxState }, true)).toBe("none");
    }
    expect(heldSendView({ ...base, direction: "inbound" }, true)).toBe("none");
    expect(heldSendView({ ...base, direction: "system" }, true)).toBe("none");
    expect(heldSendView({ ...base, outboxEffectKey: undefined }, true)).toBe("none");
  });
});
