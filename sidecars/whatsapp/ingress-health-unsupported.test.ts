// S05a-03. A customer message from a group, a status or a broadcast list is
// skipped on purpose (ledger #317), but it used to leave only a diagnostics
// line. It is now COUNTED, in its own counter, so the app can tell the seller
// "N messages could not be received" instead of nothing.
// Real code: inbound-subscriber.ts and ingress-health.ts (real file in a temp
// folder). Stand-ins: the spool, the diagnostics sink, the broadcast.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createInboundSubscriber } from "./inbound-subscriber";
import type { InboundSubscriberDeps } from "./inbound-subscriber";
import { createIngressHealth } from "./ingress-health";
import type { SidecarEvent } from "./whatsapp";

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "w192-health-"));
  dirs.push(dir);
  return join(dir, "health.json");
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function messageEvent(remoteJid: string, fromMe = false): SidecarEvent {
  return {
    type: "message",
    message: { key: { remoteJid, fromMe, id: "ID1" }, message: { conversation: "hi" } },
  } as unknown as SidecarEvent;
}

function harness(file: string) {
  const health = createIngressHealth({ file, spool: () => null });
  const enqueue = vi.fn();
  const deps = {
    getStatus: () => ({ status: "connected", user: { id: "me:1@s.whatsapp.net" } }),
    credentialAccountId: () => "me:1@s.whatsapp.net",
    spool: { enqueue },
    diagnostics: { record: vi.fn() },
    broadcast: vi.fn(),
    health,
  } as unknown as InboundSubscriberDeps;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  return { health, subscriber: createInboundSubscriber(deps), enqueue };
}

describe("the unsupported-chat counter", () => {
  it("counts a group message, a status post and a broadcast list, each once", () => {
    const { health, subscriber, enqueue } = harness(tempFile());
    subscriber(messageEvent("120363000000000000@g.us"));
    subscriber(messageEvent("status@broadcast"));
    subscriber(messageEvent("1234567890@broadcast"));
    const block = health.build();
    expect(block.lost.sinceStart.unsupportedChat).toBe(3);
    expect(block.lost.total.unsupportedChat).toBe(3);
    expect(block.lost.lastAt).not.toBeNull();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not count the seller's own echo or a normal customer message", () => {
    const { health, subscriber } = harness(tempFile());
    subscriber(messageEvent("120363000000000000@g.us", true));
    subscriber(messageEvent("22236000000@s.whatsapp.net"));
    expect(health.build().lost.sinceStart.unsupportedChat).toBe(0);
  });

  it("keeps its own counter: the other losses stay at zero", () => {
    const { health, subscriber } = harness(tempFile());
    subscriber(messageEvent("120363000000000000@g.us"));
    const lost = health.build().lost;
    expect(lost.sinceStart.spoolFailed).toBe(0);
    expect(lost.sinceStart.noPairedAccount).toBe(0);
    expect(lost.total.quarantinePruned).toBe(0);
  });

  it("survives a restart: total keeps the count, since-start begins again", () => {
    const file = tempFile();
    const first = createIngressHealth({ file, spool: () => null });
    first.recordLost("unsupportedChat", 4);
    const second = createIngressHealth({ file, spool: () => null });
    const lost = second.build().lost;
    expect(lost.total.unsupportedChat).toBe(4);
    expect(lost.sinceStart.unsupportedChat).toBe(0);
  });

  it("reads a counters file written before this counter existed as zero", () => {
    const file = tempFile();
    writeFileSync(
      file,
      JSON.stringify({ v: 1, lost: { spoolFailed: 2, noPairedAccount: 1, quarantinePruned: 0 } }),
    );
    const lost = createIngressHealth({ file, spool: () => null }).build().lost;
    expect(lost.total.unsupportedChat).toBe(0);
    expect(lost.total.spoolFailed).toBe(2);
  });
});
