// W3-F178 phase A: the inbox mount as its own module (structural deps; nothing from app.ts). Real vault, fake relay/opener.
import { describe, expect, it } from "vitest";
import type { ConversationsProjection } from "../../../src/lib/connected-platform/contracts";
import { createInboxMount } from "../src/app/inbox-mount";
import { createVault } from "../src/storage/sealed";
import { intervalFor, kindsFor } from "../src/sync/schedule";
import { NOW, conv, proj } from "./inbox-fixtures";

const OLD = proj([conv({ id: "c1" })]); const NEW = proj([conv({ id: "c2", contactName: "Sara K." })]);
type Ports = Parameters<Parameters<typeof createInboxMount>[0]["makeHost"]>[0];
function rig(o: { load?: () => Promise<{ attachInboxHost(h: unknown): void }>; open?: () => Promise<{ data: ConversationsProjection; asOf: number } | null>; poll?: (k: string) => Promise<void> } = {}) {
  const vault = createVault(); const log: string[] = []; const app = new Set<() => void>(); let ports: Ports | null = null; let loads = 0;
  const mount = createInboxMount({
    vault,
    loadScreen: o.load ?? (async () => { loads += 1; log.push("load"); return { attachInboxHost: () => { log.push("attach"); } }; }),
    makeHost: (p) => { ports = p; return {} as never; },
    openConversations: o.open ?? (async () => { log.push("open"); return { data: NEW, asOf: NOW - 5_000 }; }),
    poll: o.poll ?? (async (k) => { log.push(`poll:${k}`); }),
    subscribeAll: (fn) => { app.add(fn); return () => { app.delete(fn); }; },
  });
  return { vault, log, mount, app, loads: () => loads, ports: () => ports as Ports };
}
const seed = (r: ReturnType<typeof rig>): void => { r.vault.put("conversations", OLD); r.vault.put("conversations.asOf", NOW - 120_000); };

describe("the screen chunk", () => {
  it("is loaded once and attached once, however many visits", async () => {
    const r = rig();
    expect(await r.mount.visit("inbox")).toBe(true); expect(await r.mount.visit("conversation")).toBe(true); await r.mount.visit("inbox");
    expect(r.log.filter((x) => x === "load")).toEqual(["load"]); expect(r.log.filter((x) => x === "attach")).toEqual(["attach"]);
  });
  it("two visits at the same moment share one load", async () => {
    const r = rig(); await Promise.all([r.mount.visit("inbox"), r.mount.visit("conversation")]);
    expect(r.loads()).toBe(1); expect(r.log.filter((x) => x === "attach")).toHaveLength(1);
  });
  it("a failed load attaches nothing, never throws, and the next visit retries", async () => {
    let n = 0; const log: string[] = [];
    const r = rig({ load: async () => { n += 1; if (n === 1) throw new Error("chunk 404"); return { attachInboxHost: () => { log.push("attach"); } }; } });
    expect(await r.mount.visit("inbox")).toBe(false); expect(log).toEqual([]);
    expect(await r.mount.visit("inbox")).toBe(true); expect(n).toBe(2); expect(log).toEqual(["attach"]);
  });
  it("a visit after unlock fills the empty vault from the sealed copy, without a poll", async () => {
    const r = rig(); await r.mount.visit("inbox");
    expect(r.log).toEqual(["load", "attach", "open"]); expect(r.mount.read()).toEqual({ status: "ready", data: NEW, asOf: NOW - 5_000 }); // asOf is when the sealed copy arrived, never "now"
  });
});

describe("reload", () => {
  it("a visit with data already in the vault opens nothing and keeps it", async () => {
    const r = rig(); seed(r); await r.mount.visit("inbox"); expect(r.log).toEqual(["load", "attach"]); expect(r.vault.get("conversations")).toBe(OLD);
  });
  it("two taps at once share one poll", async () => {
    const r = rig(); seed(r); await Promise.all([r.mount.reload(), r.mount.reload()]); expect(r.log).toEqual(["poll:conversations", "open"]);
  });
  it("polls conversations, then opens, then puts into the vault, then tells the screen once", async () => {
    const r = rig(); seed(r); let told = 0; r.mount.subscribe(() => { told += 1; });
    await r.mount.reload();
    expect(r.log).toEqual(["poll:conversations", "open"]); expect(r.vault.get("conversations")).toBe(NEW); expect(r.vault.get("conversations.asOf")).toBe(NOW - 5_000);
    expect(told).toBe(1); expect(r.mount.lastReload()).toBe("ok");
    r.app.forEach((f) => f()); expect(told).toBe(2); // the app's own ticks reach the same subscriber
  });
  it("a failed open keeps the old copy and says stale; it never throws and nobody is told", async () => {
    for (const open of [async () => null, async () => { throw new Error("bad envelope"); }]) {
      const r = rig({ open }); seed(r); let told = 0; r.mount.subscribe(() => { told += 1; });
      await expect(r.mount.reload()).resolves.toBeUndefined();
      expect(r.vault.get("conversations")).toBe(OLD); expect(r.mount.read()).toEqual({ status: "ready", data: OLD, asOf: NOW - 120_000 });
      expect(r.mount.lastReload()).toBe("failed"); expect(told).toBe(0);
    }
  });
  it("a failed poll opens nothing and keeps the old copy", async () => {
    const r = rig({ poll: async () => { throw new Error("offline"); } }); seed(r);
    await expect(r.mount.reload()).resolves.toBeUndefined(); expect(r.log).toEqual([]); expect(r.vault.get("conversations")).toBe(OLD); expect(r.mount.lastReload()).toBe("failed");
  });
  it("with nothing ever stored, a failed open shows the error state, not an empty inbox", async () => {
    const r = rig({ open: async () => null }); await r.mount.reload();
    expect(r.mount.read()).toEqual({ status: "error", data: null, asOf: null });
  });
  it("the host's reload is the same reload", async () => {
    const r = rig(); await r.mount.visit("inbox"); r.log.length = 0; await r.ports().reload(); expect(r.log).toEqual(["poll:conversations", "open"]);
  });
});

describe("the sync schedule (literal names)", () => {
  it("inbox and conversation fetch the conversations projection, every 30 s, and nothing else", () => {
    expect(kindsFor("inbox")).toEqual(["conversations"]); expect(kindsFor("conversation")).toEqual(["conversations"]);
    expect(intervalFor("inbox")).toBe(30_000); expect(intervalFor("conversation")).toBe(30_000);
    expect(kindsFor("orders")).toEqual(["orders"]); expect(kindsFor("today")).toEqual(["dashboard"]);
  });
});
