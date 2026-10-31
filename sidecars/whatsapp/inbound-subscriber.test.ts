import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { DiagnosticValue, DiagnosticsSink } from "./diagnostics-log";
import {
  createInboundSubscriber,
  decideInboundAccount,
} from "./inbound-subscriber";
import { createIngressHealth } from "./ingress-health";
import type { IncomingMessage, SidecarEvent } from "./whatsapp";

// On 2026-10-18 the Founder closed SahelFlow, a message arrived, and after
// reopening it never reached the Inbox. His diagnostics show why it could not:
// in every launch WhatsApp's "offline messages delivered" signal arrived about
// a second BEFORE the connection was reported open, and the gate dropped every
// message that came in while the status was still "connecting".

const ACCOUNT = "213555999000:12@s.whatsapp.net";
const SECRET_BODY = "TOPSECRET-BODY";
const SECRET_NUMBER = "2135551230";
const FORBIDDEN = ["TOPSECRET", SECRET_NUMBER, "s.whatsapp.net", "555999000", "PROVIDER-ID"];

function incoming(n: number, overrides: Partial<IncomingMessage["key"]> = {}): IncomingMessage {
  return {
    key: {
      remoteJid: `${SECRET_NUMBER}${n}@s.whatsapp.net`,
      fromMe: false,
      id: `PROVIDER-ID-${n}`,
      ...overrides,
    },
    message: { conversation: `${SECRET_BODY}-${n}` },
    messageTimestamp: 1_786_000_000 + n,
    pushName: "Client",
  };
}

function messageEvent(message: IncomingMessage): SidecarEvent {
  return { type: "message", message };
}

function harness(state: {
  status: string;
  userId: string | null;
  credentialId: string | null;
  failEnqueue?: boolean;
}) {
  const diagnosticsLines: Array<{ event: string; fields: Record<string, DiagnosticValue> }> = [];
  const sink: DiagnosticsSink = {
    record(event, fields) {
      diagnosticsLines.push({ event, fields: { ...(fields ?? {}) } });
    },
  };
  const spooled: Array<{ accountId: string; message: IncomingMessage }> = [];
  const broadcasts: SidecarEvent[] = [];
  const live = { ...state };
  const subscriber = createInboundSubscriber({
    getStatus: () => ({
      status: live.status,
      user: live.userId ? { id: live.userId } : null,
    }),
    credentialAccountId: () => live.credentialId,
    spool: {
      enqueue(accountId, message) {
        if (live.failEnqueue) throw new Error("disk full");
        spooled.push({ accountId, message });
      },
    },
    diagnostics: sink,
    broadcast: (event) => broadcasts.push(event),
  });
  return { subscriber, spooled, broadcasts, diagnosticsLines, live };
}

describe("decideInboundAccount", () => {
  it("uses the connected identity once the connection is open", () => {
    expect(
      decideInboundAccount({ connection: "connected", connectedUserId: ACCOUNT, credentialAccountId: ACCOUNT }),
    ).toEqual({ action: "spool", accountId: ACCOUNT, beforeOpen: false });
  });

  it("keeps a message that arrives before the connection is open, under the saved login's account", () => {
    for (const connection of ["connecting", "disconnected", "qr"]) {
      expect(
        decideInboundAccount({ connection, connectedUserId: null, credentialAccountId: ACCOUNT }),
      ).toEqual({ action: "spool", accountId: ACCOUNT, beforeOpen: true });
    }
  });

  it("drops only when there is no paired account at all", () => {
    expect(
      decideInboundAccount({ connection: "connecting", connectedUserId: null, credentialAccountId: null }),
    ).toEqual({ action: "drop", connection: "connecting" });
    expect(
      decideInboundAccount({ connection: "connecting", connectedUserId: undefined, credentialAccountId: "" }),
    ).toEqual({ action: "drop", connection: "connecting" });
  });
});

describe("inbound gate: the offline backlog that precedes 'open'", () => {
  it("spools a whole backlog delivered while the status is still connecting, then keeps spooling after open", () => {
    const { subscriber, spooled, live } = harness({
      status: "connecting",
      userId: null,
      credentialId: ACCOUNT,
    });

    // WhatsApp flushes the messages it held while the app was closed ...
    for (let n = 1; n <= 5; n += 1) subscriber(messageEvent(incoming(n)));
    // ... and only then does the connection report open.
    live.status = "connected";
    live.userId = ACCOUNT;
    subscriber(messageEvent(incoming(6)));

    expect(spooled.map((entry) => entry.message.key.id)).toEqual([
      "PROVIDER-ID-1",
      "PROVIDER-ID-2",
      "PROVIDER-ID-3",
      "PROVIDER-ID-4",
      "PROVIDER-ID-5",
      "PROVIDER-ID-6",
    ]);
    // One identity for all of them: the app compares it with the connected account.
    expect(new Set(spooled.map((entry) => entry.accountId))).toEqual(new Set([ACCOUNT]));
  });

  it("keeps a backlog message that was sent from the seller's own phone (fromMe)", () => {
    const { subscriber, spooled } = harness({ status: "connecting", userId: null, credentialId: ACCOUNT });
    subscriber(messageEvent(incoming(1, { fromMe: true })));
    expect(spooled).toHaveLength(1);
    expect(spooled[0]?.message.key.fromMe).toBe(true);
  });

  it("spools again after a reconnect: the status falls back to connecting, the login is still known", () => {
    const { subscriber, spooled, live } = harness({ status: "connected", userId: ACCOUNT, credentialId: ACCOUNT });
    subscriber(messageEvent(incoming(1)));
    live.status = "connecting"; // the network dropped and the manager is reconnecting
    live.userId = ACCOUNT;
    subscriber(messageEvent(incoming(2)));
    expect(spooled).toHaveLength(2);
  });

  it("records the early arrivals as counts only, and caps those lines", () => {
    const { subscriber, spooled, diagnosticsLines } = harness({
      status: "connecting",
      userId: null,
      credentialId: ACCOUNT,
    });
    for (let n = 1; n <= 45; n += 1) subscriber(messageEvent(incoming(n)));

    expect(spooled).toHaveLength(45); // every message is kept ...
    const early = diagnosticsLines.filter((line) => line.event === "inbound.early");
    expect(early).toHaveLength(20); // ... only the diagnostics lines are capped
    expect(early[0]?.fields).toEqual({ connection: "connecting" });
    const written = JSON.stringify(diagnosticsLines);
    for (const forbidden of FORBIDDEN) expect(written).not.toContain(forbidden);
  });

  it("does not mark messages that arrive after open as early", () => {
    const { subscriber, diagnosticsLines } = harness({ status: "connected", userId: ACCOUNT, credentialId: ACCOUNT });
    subscriber(messageEvent(incoming(1)));
    expect(diagnosticsLines.some((line) => line.event === "inbound.early")).toBe(false);
  });
});

describe("inbound gate: what is still refused, and never silently", () => {
  it("drops, with a trace, when no account is paired", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { subscriber, spooled, diagnosticsLines } = harness({ status: "connecting", userId: null, credentialId: null });
    subscriber(messageEvent(incoming(1)));
    error.mockRestore();

    expect(spooled).toHaveLength(0);
    expect(diagnosticsLines).toEqual([
      { event: "inbound.dropped", fields: { reason: "no-paired-account", connection: "connecting" } },
    ]);
  });

  it("skips groups and broadcasts with a trace that names the kind and never the identity", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { subscriber, spooled, diagnosticsLines } = harness({ status: "connected", userId: ACCOUNT, credentialId: ACCOUNT });
    subscriber(messageEvent(incoming(1, { remoteJid: "120363000000000000@g.us" })));
    subscriber(messageEvent(incoming(2, { remoteJid: "status@broadcast" })));
    warn.mockRestore();

    expect(spooled).toHaveLength(0);
    expect(diagnosticsLines.map((line) => line.fields.jidKind)).toEqual(["g.us", "broadcast"]);
    expect(JSON.stringify(diagnosticsLines)).not.toContain("1203630");
  });

  it("passes a seller's own non-individual echo to the live clients instead of the spool", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { subscriber, spooled, broadcasts } = harness({ status: "connected", userId: ACCOUNT, credentialId: ACCOUNT });
    const echo = messageEvent(incoming(1, { remoteJid: "120363000000000000@g.us", fromMe: true }));
    subscriber(echo);
    warn.mockRestore();
    expect(spooled).toHaveLength(0);
    expect(broadcasts).toEqual([echo]);
  });

  it("forwards non-message events (status, qr) to the live clients untouched", () => {
    const { subscriber, broadcasts, spooled } = harness({ status: "connecting", userId: null, credentialId: ACCOUNT });
    const status: SidecarEvent = { type: "status", status: "connecting" };
    subscriber(status);
    expect(broadcasts).toEqual([status]);
    expect(spooled).toHaveLength(0);
  });

  it("records a spool failure without throwing and without the failure's text", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { subscriber, diagnosticsLines } = harness({
      status: "connected",
      userId: ACCOUNT,
      credentialId: ACCOUNT,
      failEnqueue: true,
    });
    expect(() => subscriber(messageEvent(incoming(1)))).not.toThrow();
    error.mockRestore();
    expect(diagnosticsLines.map((line) => line.event)).toEqual(["inbound.spool-failed"]);
  });
});

describe("inbound gate: losses are reported to the ingress-health recorder", () => {
  function recorderHarness(opts: { paired: boolean; failEnqueue?: boolean }) {
    const lines: Array<{ event: string; fields: Record<string, DiagnosticValue> }> = [];
    const sink: DiagnosticsSink = {
      record(event, fields) {
        lines.push({ event, fields: { ...(fields ?? {}) } });
      },
    };
    const health = { recordLost: vi.fn(), recordSpooled: vi.fn() };
    const subscriber = createInboundSubscriber({
      getStatus: () => ({ status: "connected", user: opts.paired ? { id: ACCOUNT } : null }),
      credentialAccountId: () => (opts.paired ? ACCOUNT : null),
      spool: {
        enqueue() {
          if (opts.failEnqueue) throw new Error("EBUSY");
          return {};
        },
      },
      diagnostics: sink,
      broadcast: vi.fn(),
      health,
    });
    return { subscriber, health, lines };
  }

  it("a spool failure is reported to the recorder and still logged", () => {
    const { subscriber, health, lines } = recorderHarness({ paired: true, failEnqueue: true });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => subscriber(messageEvent(incoming(1)))).not.toThrow();
    error.mockRestore();
    expect(health.recordLost).toHaveBeenCalledWith("spoolFailed");
    expect(health.recordSpooled).not.toHaveBeenCalled();
    expect(lines.map((line) => line.event)).toEqual(["inbound.spool-failed"]);
  });

  it("no-paired-account is reported", () => {
    const { subscriber, health, lines } = recorderHarness({ paired: false });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    subscriber(messageEvent(incoming(1)));
    error.mockRestore();
    expect(health.recordLost).toHaveBeenCalledWith("noPairedAccount");
    expect(lines.map((line) => line.event)).toEqual(["inbound.dropped"]);
  });
});

// How customers arrive (identity design, slice 1): customer messages counted by the
// KIND of chat address, never by the address.
describe("how customers arrive: kinds counted, ids never kept", () => {
  const LID_NUMBER = "98765432109876";
  function arrival() {
    const dir = mkdtempSync(join(tmpdir(), "sf-arrival-"));
    const lines: Array<{ event: string; fields: Record<string, DiagnosticValue> }> = [];
    const sink: DiagnosticsSink = { record: (event, fields) => void lines.push({ event, fields: { ...(fields ?? {}) } }) };
    const health = createIngressHealth({ file: join(dir, "health.json"), spool: () => null });
    const subscriber = createInboundSubscriber({
      getStatus: () => ({ status: "connecting", user: null }),
      credentialAccountId: () => ACCOUNT,
      spool: { enqueue: () => undefined },
      diagnostics: sink,
      broadcast: () => undefined,
      health,
    });
    return { dir, lines, health, subscriber };
  }

  it("counts an @lid customer message as kind lid and a phone message as kind phone", () => {
    const { dir, health, subscriber } = arrival();
    try {
      subscriber(messageEvent(incoming(1, { remoteJid: `${LID_NUMBER}@lid` })));
      subscriber(messageEvent(incoming(2, { remoteJid: `${LID_NUMBER}1@lid` })));
      subscriber(messageEvent(incoming(3)));
      expect(health.build().inbound.kinds).toEqual({ phone: 1, lid: 2 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("own (fromMe) messages are not counted as customers", () => {
    const { dir, health, subscriber } = arrival();
    try {
      subscriber(messageEvent(incoming(1, { remoteJid: `${LID_NUMBER}@lid`, fromMe: true })));
      subscriber(messageEvent(incoming(2, { fromMe: true })));
      const block = health.build();
      expect(block.inbound.kinds).toEqual({ phone: 0, lid: 0 });
      expect(block.inbound.lastSpooledAt).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never records the id text in any diagnostics line or in the counts", () => {
    const { dir, lines, health, subscriber } = arrival();
    try {
      subscriber(messageEvent(incoming(1, { remoteJid: `${LID_NUMBER}@lid` })));
      subscriber(messageEvent(incoming(2)));
      subscriber(messageEvent(incoming(3, { remoteJid: "120363000000000000@g.us" })));
      const everything = JSON.stringify({ lines, kinds: health.build().inbound.kinds });
      expect(lines.length).toBeGreaterThan(0);
      expect(everything).not.toMatch(/\d{6,}/);
      expect(everything).not.toContain("@");
      expect(everything).not.toContain(LID_NUMBER);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("wiring", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("/status adds the ingress block next to the manager status and changes none of its fields", () => {
    const index = read("sidecars/whatsapp/index.ts");
    expect(index).toContain(
      'app.get("/status", (context) => context.json({ ...wa.getStatus(), ingress: ingressHealth.build(), identityEvidence: jidEvidence.summary() }));',
    );
  });

  it("index.ts builds its subscriber from the tested gate and no longer carries the old inline check", () => {
    const index = read("sidecars/whatsapp/index.ts");
    expect(index).toContain("createInboundSubscriber({");
    expect(index).toContain("credentialAccountId: () => wa.credentialAccountId(),");
    expect(index).not.toContain('status.status !== "connected" || !status.user?.id');
  });

  it("the manager learns the paired account when it loads the saved login, and forgets it on logout", () => {
    const manager = read("sidecars/whatsapp/whatsapp.ts");
    expect(manager).toContain("const savedAccountId = state.creds.me?.id;");
    expect(manager).toContain("credentialAccountId(): string | null {");
    expect(manager).toMatch(/private clearAuth\(\): void \{\s*this\.pairedAccountId = null;/);
  });
});
