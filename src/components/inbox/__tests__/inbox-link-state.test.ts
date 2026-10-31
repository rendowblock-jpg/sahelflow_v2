import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  deriveInboxLinkState,
  type InboxLinkInputs,
} from "@/components/inbox/inbox-link-state";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const STATUSES = [null, "disconnected", "connecting", "qr", "connected"] as const;
const TRI = [null, true, false] as const;
const BOOL = [false, true] as const;

const ALL: InboxLinkInputs[] = [];
for (const status of STATUSES)
  for (const reachable of TRI)
    for (const browserOnline of TRI)
      for (const wsOpen of BOOL)
        for (const dataDegraded of BOOL)
          ALL.push({ status, reachable, browserOnline, wsOpen, dataDegraded });

const base: InboxLinkInputs = {
  status: "connected",
  reachable: true,
  browserOnline: true,
  wsOpen: true,
  dataDegraded: false,
};

describe("deriveInboxLinkState: table", () => {
  const rows: Array<
    [string, Partial<InboxLinkInputs>, string, boolean, string | null, boolean]
  > = [
    ["healthy", {}, "connected", false, null, false],
    ["connected, socket closed", { wsOpen: false }, "connecting", false, "reconnect", false],
    ["connecting", { status: "connecting", wsOpen: false }, "connecting", true, null, false],
    ["status unknown yet", { status: null, reachable: null, wsOpen: false }, "connecting", true, null, false],
    ["qr (never linked)", { status: "qr", wsOpen: false }, "unofficial-only", true, "pair", false],
    ["link lost", { status: "disconnected", wsOpen: false }, "disconnected", true, "reconnect", true],
    ["service unreachable", { status: null, reachable: false, wsOpen: false }, "error", true, "retry", true],
    ["browser offline", { browserOnline: false }, "offline", true, "retry", false],
    ["offline beats link lost", { browserOnline: false, status: "disconnected", wsOpen: false }, "offline", true, "retry", false],
    ["contradiction: unreachable but connected", { reachable: false }, "error", true, "retry", true],
    ["contradiction: connected, ws open, reachable null", { reachable: null }, "connected", false, null, false],
    ["degraded list alone does not block", { dataDegraded: true }, "connected", false, null, false],
  ];
  for (const [name, patch, kind, blocks, action, saved] of rows) {
    it(name, () => {
      const out = deriveInboxLinkState({ ...base, ...patch });
      expect(out.kind).toBe(kind);
      expect(out.blocksSending).toBe(blocks);
      expect(out.action).toBe(action);
      expect(out.savedOnDevice).toBe(saved);
    });
  }
});

describe("deriveInboxLinkState: invariants over every input combination", () => {
  it("covers 180 combinations", () => expect(ALL).toHaveLength(180));
  it("blocksSending mirrors the thread rule (status must be connected) and never lies", () => {
    for (const i of ALL) {
      const o = deriveInboxLinkState(i);
      if (i.status !== "connected") expect(o.blocksSending, JSON.stringify(i)).toBe(true);
      if (i.browserOnline === false || i.reachable === false) expect(o.blocksSending, JSON.stringify(i)).toBe(true);
      if (o.kind === "connected") {
        expect(i.status).toBe("connected");
        expect(i.wsOpen).toBe(true);
        expect(o.blocksSending).toBe(false);
      }
    }
  });
  it("offline wins, then unreachable service", () => {
    for (const i of ALL) {
      const o = deriveInboxLinkState(i);
      if (i.browserOnline === false) expect(o.kind).toBe("offline");
      else if (i.reachable === false) expect(o.kind).toBe("error");
    }
  });
  it("the banner appears only when sending is blocked, and always carries an action", () => {
    for (const i of ALL) {
      const o = deriveInboxLinkState(i);
      const bannerKind = ["disconnected", "offline", "error", "unofficial-only"].includes(o.kind);
      expect(o.showBanner, JSON.stringify(i)).toBe(bannerKind);
      if (o.showBanner) {
        expect(o.blocksSending).toBe(true);
        expect(o.action).not.toBeNull();
      }
    }
  });
  it("every state has a shape (never colour alone)", () => {
    const shapeOf = { connected: "dot", connecting: "ring", "unofficial-only": "ring", disconnected: "triangle", error: "triangle", offline: "triangle" } as const;
    for (const i of ALL) {
      const o = deriveInboxLinkState(i);
      expect(o.shape).toBe(shapeOf[o.kind]);
    }
  });
  it("'saved on this device' is claimed only where the draft route is reachable", () => {
    for (const i of ALL) {
      const o = deriveInboxLinkState(i);
      if (o.savedOnDevice) expect(["disconnected", "error"]).toContain(o.kind);
      if (o.kind === "offline") expect(o.savedOnDevice).toBe(false);
    }
  });
  it("the unofficial sentence is open only while linking, collapsed otherwise; stale flag follows dataDegraded", () => {
    for (const i of ALL) {
      const o = deriveInboxLinkState(i);
      expect(o.unofficialDetail).toBe(o.kind === "unofficial-only" ? "open" : "collapsed");
      expect(o.listStale).toBe(i.dataDegraded);
    }
  });
  it("is pure: same input same output, input untouched", () => {
    const i = { ...base, status: "disconnected" as const, wsOpen: false };
    const copy = { ...i };
    expect(deriveInboxLinkState(i)).toEqual(deriveInboxLinkState(i));
    expect(i).toEqual(copy);
  });
});

/** Cut out the argument text of every `useEffect(` call (balanced parens). */
function effectBodies(src: string): string[] {
  const out: string[] = [];
  let at = src.indexOf("useEffect(");
  while (at !== -1) {
    let depth = 0;
    let i = src.indexOf("(", at);
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) break;
    }
    out.push(src.slice(start, i + 1));
    at = src.indexOf("useEffect(", i);
  }
  return out;
}

describe("reconnect is always manual", () => {
  const files = [
    "src/components/inbox/inbox-link-state.ts",
    "src/components/inbox/inbox-link-surface.tsx",
    "src/components/inbox/inbox-v3-header.tsx",
    "src/components/inbox/inbox-queue-states.tsx",
  ];
  for (const f of files) {
    it(`${f}: no timer, no effect that reconnects, retries or pairs`, () => {
      const src = read(f);
      expect(src).not.toMatch(/setInterval\(|setTimeout\(/);
      for (const body of effectBodies(src)) {
        expect(body).not.toMatch(/reconnect|refreshQr|refreshChats|connectWhatsApp|onRetry|onAction/);
      }
    });
  }
});

describe("the 'saved on this device' sentence is backed by code", () => {
  it("drafts are written by PUT to the local database and do not depend on the WhatsApp link", () => {
    const drafts = read("src/hooks/inbox/use-inbox-drafts.ts");
    const at = drafts.indexOf("const persistDraft = useCallback(");
    const section = drafts.slice(at, at + 2600);
    expect(section).toContain('method: "PUT"');
    expect(section).toContain("/draft");
    expect(section).not.toMatch(/transport|wsOpen|sidecar|status ===/);
    expect(read("src/app/api/conversations/[id]/draft/route.ts")).toContain("draftBody");
  });
  it("the surface prints the sentence only when the state says savedOnDevice", () => {
    const surface = read("src/components/inbox/inbox-link-surface.tsx");
    expect(surface).toMatch(/link\.savedOnDevice\s*\?/);
    expect(surface).toContain("inbox.carnet.link.saved");
  });
});
