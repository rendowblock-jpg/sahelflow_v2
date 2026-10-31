import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { messageVisual } from "@/components/inbox/inbox-message-visual";
import { bubbleDeliveryStatus, outboxAllowsResend } from "@/components/inbox/inbox-thread-message";

/**
 * The owner's "Discard" on a held WhatsApp send must reach the thread. The notice, the dialog, the route and the hook
 * were built first; until the four inbox files below pass the pieces through, the button never shows.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const discarded = {
  direction: "outbound" as const,
  outboxEffectKey: "effect-1",
  outboxState: "discarded" as const,
  deliveryStatus: "sending" as const,
};

describe("a discarded message in the thread", () => {
  it("is drawn as not sent (never a clock or a sent tick)", () => {
    expect(bubbleDeliveryStatus(discarded)).toBe("failed");
  });

  it("offers no Retry: the owner said do not send it", () => {
    expect(outboxAllowsResend(discarded)).toBe(false);
  });

  it("gets no second red 'Not sent' line next to the calm 'Discarded' notice", () => {
    const visual = messageVisual({
      status: bubbleDeliveryStatus(discarded),
      canResend: outboxAllowsResend(discarded),
      held: true,
    });
    expect(visual.showNotSent).toBe(false);
    expect(visual.showRetry).toBe(false);
  });

  it("a dead_letter row (a real failure) still offers Retry, so Discard did not weaken it", () => {
    expect(outboxAllowsResend({ ...discarded, outboxState: "dead_letter" })).toBe(true);
  });
});

describe("Discard wiring (source contract, the pattern held-send-approve.test.ts uses)", () => {
  it("the workspace hook passes the four discard members through", () => {
    const source = read("src/hooks/use-inbox-workspace.ts");
    for (const name of ["heldDiscardMessage", "resolveHeldDiscard", "discardHeldMessage", "heldDiscardStatus"]) {
      expect(source, name).toContain(`${name}: outbox.${name},`);
    }
  });

  it("the message type knows the discarded state, so the hook needs no cast", () => {
    expect(read("src/components/inbox/inbox-workspace-types.ts")).toContain('| "discarded"');
    expect(read("src/hooks/inbox/use-inbox-outbox.ts")).not.toContain("as unknown as NonNullable<InboxMessage");
  });

  it("the bubble treats discarded like held in both places and hands the notice its discard props", () => {
    const source = read("src/components/inbox/inbox-thread-message.tsx");
    const pair = 'message.outboxState === "held" || message.outboxState === "discarded"';
    expect(source.split(pair).length - 1).toBe(2);
    expect(source).toContain("onDiscardHeld");
    expect(source).toContain('discarded={heldView === "discarded"}');
    expect(source).toContain("onDiscard={onDiscardHeld ? () => onDiscardHeld(message) : undefined}");
    expect(source).toContain("heldDiscard.effectKey === message.outboxEffectKey");
  });

  it("the thread wires the bubble and mounts the discard dialog", () => {
    const source = read("src/components/inbox/inbox-v3-thread.tsx");
    expect(source).toContain("onDiscardHeld={discardHeldMessage}");
    expect(source).toContain("heldDiscard={heldDiscardStatus}");
    expect(source).toContain("<HeldSendDiscardDialog");
    expect(source).toContain("open={heldDiscardMessage !== null}");
    expect(source).toContain("onResolve={resolveHeldDiscard}");
  });
});
