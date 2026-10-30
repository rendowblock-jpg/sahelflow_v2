import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { deriveInboxLinkState } from "@/components/inbox/inbox-link-state";
import { threadSendGate } from "@/components/inbox/inbox-thread-link";

type Input = Parameters<typeof deriveInboxLinkState>[0];
const src = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const STATUSES = ["connected", "connecting", "disconnected", "error", "qr"] as const;
const FLAGS = [true, false, null] as const;

function everyInput(): Input[] {
  const all: Input[] = [];
  for (const status of STATUSES)
    for (const reachable of FLAGS)
      for (const wsOpen of FLAGS)
        for (const browserOnline of FLAGS)
          for (const dataDegraded of [true, false])
            all.push({ status, reachable, wsOpen, browserOnline, dataDegraded } as unknown as Input);
  return all;
}

describe("thread send gate follows the shared link function", () => {
  it("for every input the composer can send iff it may compose and the link does not block", () => {
    let blocked = 0;
    for (const input of everyInput()) {
      const link = deriveInboxLinkState(input);
      for (const canCompose of [true, false]) {
        const gate = threadSendGate({ canCompose, link });
        expect(gate.canSend, JSON.stringify(input)).toBe(canCompose && !link.blocksSending);
        expect(gate.showPausedHint, JSON.stringify(input)).toBe(canCompose && link.blocksSending);
      }
      if (link.blocksSending) blocked += 1;
    }
    expect(blocked).toBeGreaterThan(0);
  });
});

describe("the thread no longer announces the link state itself", () => {
  const thread = src("inbox-v3-thread.tsx");
  it("reads the gate, not transport.status", () => {
    expect(thread).toContain("threadSendGate(");
    expect(thread).toContain("useThreadLinkState(");
    expect(thread).not.toContain('transport.status === "connected"');
  });
  it("has no pairing dialog and no second cause text", () => {
    expect(thread).not.toContain("<WhatsAppPairingDialog");
    expect(thread.match(/replyLiveOnly/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(thread).toContain("<ThreadPausedHint");
  });
  it("feeds the pure function the same five signals as the header surface", () => {
    const hook = src("inbox-thread-link.tsx");
    const surface = src("inbox-link-surface.tsx");
    for (const line of [
      "status: transport.status",
      "reachable: transport.reachable",
      "wsOpen: transport.wsOpen",
      "browserOnline",
      "dataDegraded",
    ]) {
      expect(hook, line).toContain(line);
      expect(surface, line).toContain(line);
    }
  });
});
