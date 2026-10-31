// W3b F6b: the host the settings screen runs on. Real host and real controller, an in-memory Db, fakes only for flush/refresh/wipe.
import { describe, expect, it } from "vitest";
import { createSettingsHost, type SettingsHostDeps } from "../src/app/settings-host";
import type { OutboxRecord } from "../src/outbox/state";
import { canDiscard, canRetry } from "../src/views/settings/render";
import { NOW, memDb, rec } from "./orders-fixtures";

function setup(records: OutboxRecord[] = [], o: { revoked?: boolean; wipeOk?: boolean; dbThrows?: boolean } = {}) {
  const db = memDb(); const log: string[] = []; let broken = o.dbThrows === true;
  const ready = Promise.all(records.map((r) => db.put("outbox", r.commandId, r)));
  const deps: SettingsHostDeps = {
    now: () => NOW, locale: () => "en", online: () => true, theme: () => "system", hasLock: () => false, revoked: () => o.revoked === true,
    projectionAt: () => NOW - 3 * 3_600_000, pairedAt: async () => NOW - 86_400_000,
    db: async () => { if (broken) throw new Error("idb"); await ready; return db; },
    flush: async () => { log.push("flush"); }, refresh: async () => { log.push("refresh"); },
    setLocale: (l) => { log.push(`lang:${l}`); }, setTheme: (x) => { log.push(`theme:${x}`); }, startLockSetup: () => { log.push("lock"); },
    wipe: async () => { log.push("wipe"); return { ok: o.wipeOk !== false }; },
  };
  return { host: createSettingsHost(deps), db, log, fix: () => { broken = false; } };
}

describe("settings host: reading", () => {
  it("says loading before the first read, then ready with ONLY the open commands and the sealed copy's time", async () => {
    const x = setup([rec({ commandId: "a", state: "queued" }), rec({ commandId: "b", state: "committed" }), rec({ commandId: "c", state: "sent" })]);
    expect(x.host.read()).toEqual({ status: "loading" });
    await x.host.reload();
    const r = x.host.read();
    expect(r.status === "ready" && r.commands.map((c) => c.commandId)).toEqual(["a", "c"]);
    expect(r.status === "ready" && r.asOf).toBe(NOW - 3 * 3_600_000);
    expect(r.status === "ready" && r.pairedAt).toBe(NOW - 86_400_000);
  });
  it("a storage failure is an error (never an empty list); a second reload recovers", async () => {
    const x = setup([rec()], { dbThrows: true });
    await x.host.reload(); expect(x.host.read()).toEqual({ status: "error" });
    x.fix(); await x.host.reload(); expect(x.host.read().status).toBe("ready");
  });
  it("a removed phone reads revoked", () => { expect(setup([], { revoked: true }).host.read()).toEqual({ status: "revoked" }); });
});

describe("settings host: retry, discard, remove", () => {
  it("retry sends the SAME sealed text again: only the due time and the error change", async () => {
    const x = setup([rec({ commandId: "a", state: "queued", nextTryAt: NOW + 999_999, lastError: "http_503", sealedEnvelopeJson: "{\"sealed\":1}" })]);
    await x.host.retry("a");
    const after = await x.db.get<OutboxRecord>("outbox", "a");
    expect(after).toMatchObject({ nextTryAt: NOW, lastError: null, sealedEnvelopeJson: "{\"sealed\":1}", state: "queued" });
    expect(x.log).toEqual(["flush"]);
  });
  it("retry of an unknown command asks the relay again; a reply the PC already answered gets nothing", async () => {
    const x = setup([rec({ commandId: "u", state: "unknown" }), rec({ commandId: "r", state: "unknown", resultCode: "ALREADY_ANSWERED" })]);
    await x.host.retry("u"); await x.host.retry("r");
    expect(x.log).toEqual(["refresh"]);
  });
  it("discard removes only a command that was never sent", async () => {
    const x = setup([rec({ commandId: "q", state: "queued" }), rec({ commandId: "s", state: "sent" }), rec({ commandId: "x", state: "queued", resultCode: "ALREADY_ANSWERED" })]);
    await x.host.discard("q"); await x.host.discard("s"); await x.host.discard("x");
    expect(await x.db.keys("outbox")).toEqual(["s", "x"]);
  });
  it("the screen's rules and the host's rules agree for every state", async () => {
    for (const state of ["queued", "sent", "unknown", "committed", "failed", "expired"] as const) {
      for (const resultCode of [undefined, "ALREADY_ANSWERED"]) {
        const r = rec({ commandId: "z", state, ...(resultCode ? { resultCode } : {}) });
        const x = setup([r]); await x.host.discard("z");
        expect((await x.db.keys("outbox")).length === 0, `${state}/${resultCode}`).toBe(canDiscard(r));
        const y = setup([r]); await y.host.retry("z");
        expect(y.log.length === 1, `${state}/${resultCode}`).toBe(canRetry(r));
      }
    }
  });
  it("remove wipes through the app and answers true or false; the list is empty after", async () => {
    const x = setup([rec()]); await x.host.reload();
    expect(await x.host.remove()).toBe(true); expect(x.log).toContain("wipe");
    const r = x.host.read(); expect(r.status === "ready" && r.commands.length).toBe(0);
    expect(await setup([], { wipeOk: false }).host.remove()).toBe(false);
  });
});
