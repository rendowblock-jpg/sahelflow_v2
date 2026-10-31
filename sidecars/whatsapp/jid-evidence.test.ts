import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { DiagnosticValue, DiagnosticsSink } from "./diagnostics-log";
import { attachJidEvidence, createJidEvidence } from "./jid-evidence";

// Identity design slice 1: how many hidden-id (@lid) customers arrive, and does the
// provider hand over a number hint? Counts and booleans only; never an id.

const LID = "98765432109876@lid";
const PN = "213555123456@s.whatsapp.net";

const lidFrame = (attrs: Record<string, unknown> = {}) => ({
  tag: "message",
  attrs: { from: LID, id: "3EB0ABCDEF123456", t: "1786000000", type: "text", ...attrs },
  content: [{ tag: "enc", attrs: { v: "2", type: "pkmsg" } }],
});

function tempDir(): { dir: string; done: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "sf-jid-evidence-"));
  return { dir, done: () => rmSync(dir, { recursive: true, force: true }) };
}

function leaves(value: unknown, out: unknown[] = []): unknown[] {
  if (value !== null && typeof value === "object") for (const child of Object.values(value)) leaves(child, out);
  else out.push(value);
  return out;
}

describe("a message frame from an @lid", () => {
  it("with sender_pn -> the hint is present (true); without -> false", () => {
    const evidence = createJidEvidence();
    expect(evidence.observeMessageFrame(lidFrame({ sender_pn: PN }))).toBe(true);
    expect(evidence.observeMessageFrame(lidFrame())).toBe(false);
    expect(evidence.observeMessageFrame(lidFrame())).toBe(false);
    expect(evidence.summary().lidMessages).toEqual({ total: 3, withNumberHint: 1, withoutNumberHint: 2 });
  });

  it("an empty or non-string sender_pn is not a hint", () => {
    const evidence = createJidEvidence();
    for (const sender_pn of ["", 42, {}, null, ["x"], true]) {
      expect(evidence.observeMessageFrame(lidFrame({ sender_pn }))).toBe(false);
    }
    expect(evidence.summary().lidMessages.withNumberHint).toBe(0);
  });

  it("only a customer message from a hidden id is counted: phone chats, groups and the seller's own echoes are not", () => {
    const evidence = createJidEvidence();
    expect(evidence.observeMessageFrame(lidFrame({ from: PN }))).toBeNull();
    expect(evidence.observeMessageFrame(lidFrame({ from: "120363000000000000@g.us", participant: LID }))).toBeNull();
    expect(evidence.observeMessageFrame(lidFrame({ recipient: "55512345678901@lid" }))).toBeNull();
    expect(evidence.summary().lidMessages.total).toBe(0);
  });

  it("the summary holds only counts and booleans, and no id even when the frame carries real ones", () => {
    const evidence = createJidEvidence();
    evidence.observeMessageFrame(lidFrame({ sender_pn: PN }));
    evidence.recordPhoneNumberShare({ lid: LID, jid: PN });
    evidence.observeHistoryChats([{ id: LID, lidJid: LID, pnJid: PN, name: "Customer Name" }]);
    const summary = evidence.summary();
    for (const leaf of leaves(summary)) expect(["number", "boolean"]).toContain(typeof leaf);
    const text = JSON.stringify(summary);
    expect(text).not.toContain("@");
    expect(text).not.toMatch(/\d{6,}/);
    expect(text).not.toContain("Customer");
  });

  it("a malformed frame never throws into the connection", () => {
    const evidence = createJidEvidence();
    const circular: Record<string, unknown> = { tag: "message" };
    circular.attrs = circular;
    const hostile = new Proxy({}, { get() { throw new Error("boom"); }, has() { throw new Error("boom"); } });
    for (const frame of [undefined, null, 0, 42, "text", [], {}, { attrs: null }, { attrs: "x" }, { attrs: { from: 5 } }, { attrs: { from: LID, sender_pn: hostile } }, circular, hostile, { attrs: hostile }]) {
      expect(() => evidence.observeMessageFrame(frame)).not.toThrow();
    }
    expect(() => evidence.summary()).not.toThrow();
  });
});

describe("phone number shares and history chats", () => {
  it("counts every chats.phoneNumberShare event without reading its payload", () => {
    const evidence = createJidEvidence();
    const payload = { get lid(): string { throw new Error("must not be read"); }, get jid(): string { throw new Error("must not be read"); } };
    expect(() => evidence.recordPhoneNumberShare(payload)).not.toThrow();
    evidence.recordPhoneNumberShare();
    expect(evidence.summary().phoneNumberShareEvents).toBe(2);
  });

  it("counts history chats that carry BOTH a phone id and a hidden id", () => {
    const evidence = createJidEvidence();
    evidence.observeHistoryChats([
      { id: LID, pnJid: PN, lidJid: LID },
      { id: PN, pnJid: PN },
      { id: LID, lidJid: LID },
      { id: PN },
      { id: "x", pnJid: "", lidJid: LID },
    ]);
    expect(evidence.summary().historyChats).toEqual({ seen: 5, withBothIds: 1 });
  });

  it("a malformed history never throws", () => {
    const evidence = createJidEvidence();
    const hostile = new Proxy({}, { get() { throw new Error("boom"); } });
    for (const chats of [undefined, null, 7, "x", {}, [null, undefined, 3, "a", hostile, []]]) {
      expect(() => evidence.observeHistoryChats(chats)).not.toThrow();
    }
  });
});

describe("persistence and the diagnostics line", () => {
  it("totals survive a restart and the file holds counts only", () => {
    const { dir, done } = tempDir();
    try {
      const file = join(dir, "whatsapp-jid-evidence.json");
      const first = createJidEvidence({ file });
      first.observeMessageFrame(lidFrame({ sender_pn: PN }));
      first.observeMessageFrame(lidFrame());
      first.recordPhoneNumberShare();
      first.flush();

      const second = createJidEvidence({ file });
      second.observeMessageFrame(lidFrame());
      second.flush();
      expect(second.summary().lidMessages).toEqual({ total: 3, withNumberHint: 1, withoutNumberHint: 2 });
      expect(second.summary().phoneNumberShareEvents).toBe(1);

      const stored = readFileSync(file, "utf8");
      expect(stored).not.toContain("@");
      expect(stored).not.toMatch(/\d{6,}/);
    } finally {
      done();
    }
  });

  it("a corrupt or foreign file starts from zero and a write failure never throws", () => {
    const { dir, done } = tempDir();
    try {
      const file = join(dir, "bad.json");
      for (const content of ["", "not json", "[]", '{"v":9}', '{"v":1,"lidMessages":{"total":"many"}}']) {
        writeFileSync(file, content);
        expect(createJidEvidence({ file }).summary().lidMessages.total).toBe(0);
      }
      const blocked = createJidEvidence({ file: join(file, "inside", "x.json") });
      blocked.observeMessageFrame(lidFrame());
      expect(() => blocked.flush()).not.toThrow();
      expect(blocked.summary().lidMessages.total).toBe(1);
    } finally {
      done();
    }
  });

  it("writes a throttled diagnostics line with numbers only", () => {
    const lines: Array<{ event: string; fields: Record<string, DiagnosticValue> }> = [];
    const sink: DiagnosticsSink = { record: (event, fields) => void lines.push({ event, fields: { ...(fields ?? {}) } }) };
    let clock = 1_000_000;
    const evidence = createJidEvidence({ diagnostics: sink, now: () => clock });
    evidence.observeMessageFrame(lidFrame({ sender_pn: PN }));
    evidence.flush();
    evidence.flush();
    expect(lines).toHaveLength(1);
    expect(lines[0]?.event).toBe("identity.evidence");
    for (const value of Object.values(lines[0]?.fields ?? {})) expect(typeof value).toBe("number");
    expect(JSON.stringify(lines)).not.toMatch(/\d{6,}|@/);
    clock += 11 * 60_000;
    evidence.observeMessageFrame(lidFrame());
    evidence.flush();
    expect(lines).toHaveLength(2);
  });
});

describe("attachJidEvidence: the three provider signals", () => {
  function fakeSocket() {
    const ws = new Map<string, (node: unknown) => void>();
    const ev = new Map<string, (payload: unknown) => void>();
    return {
      ws,
      ev,
      sock: {
        ws: { on: (name: string, fn: (node: unknown) => void) => void ws.set(name, fn) },
        ev: { on: (name: string, fn: (payload: unknown) => void) => void ev.set(name, fn) },
      },
    };
  }

  it("listens to CB:message, chats.phoneNumberShare and messaging-history.set and counts each", () => {
    const evidence = createJidEvidence();
    const { ws, ev, sock } = fakeSocket();
    attachJidEvidence(sock, evidence);
    ws.get("CB:message")?.(lidFrame({ sender_pn: PN }));
    ev.get("chats.phoneNumberShare")?.({ lid: LID, jid: PN });
    ev.get("messaging-history.set")?.({ chats: [{ id: LID, pnJid: PN, lidJid: LID }], contacts: [], messages: [] });
    const summary = evidence.summary();
    expect(summary.lidMessages.withNumberHint).toBe(1);
    expect(summary.phoneNumberShareEvents).toBe(1);
    expect(summary.historyChats).toEqual({ seen: 1, withBothIds: 1 });
  });

  it("a listener that fails inside, or a socket without ws or ev, never reaches the connection", () => {
    const broken = { observeMessageFrame: vi.fn(() => { throw new Error("boom"); }), recordPhoneNumberShare: vi.fn(() => { throw new Error("boom"); }), observeHistoryChats: vi.fn(() => { throw new Error("boom"); }), summary: vi.fn(), flush: vi.fn() };
    const { ws, ev, sock } = fakeSocket();
    expect(() => attachJidEvidence(sock, broken)).not.toThrow();
    expect(() => ws.get("CB:message")?.(lidFrame())).not.toThrow();
    expect(() => ev.get("chats.phoneNumberShare")?.({})).not.toThrow();
    expect(() => ev.get("messaging-history.set")?.({ chats: [] })).not.toThrow();
    expect(broken.observeMessageFrame).toHaveBeenCalled();
    for (const odd of [{}, { ws: null }, { ws: {} }, { ev: {} }, { ws: { on: 3 }, ev: { on: "x" } }]) {
      expect(() => attachJidEvidence(odd, createJidEvidence())).not.toThrow();
    }
  });
});

describe("wiring", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  it("the manager attaches the evidence on every socket and the shutdown flushes it", () => {
    const manager = read("sidecars/whatsapp/whatsapp.ts");
    expect(manager).toContain("attachJidEvidence(this.sock, jidEvidence);");
    expect(read("sidecars/whatsapp/index.ts")).toContain("jidEvidence.flush();");
  });
});
