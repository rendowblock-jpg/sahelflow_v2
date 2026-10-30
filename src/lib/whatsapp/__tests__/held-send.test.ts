import { describe, expect, it } from "vitest";

import {
  HELD_SEND_OTHER_CHATS,
  decideHeldApproval,
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
    expect(projectOutboxEffectState({ status: "dead_letter", outcomeState: "none", lastErrorCode: HOLD })).toBe("dead_letter");
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

describe("what the bubble offers", () => {
  const base = { direction: "outbound" as const, outboxState: "held" as const, outboxEffectKey: "wa:k" };
  it("owner gets the button, a member gets the sentence only", () => {
    expect(heldSendView(base, true)).toBe("owner_can_release");
    expect(heldSendView(base, false)).toBe("ask_owner");
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
