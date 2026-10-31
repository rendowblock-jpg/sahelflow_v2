// W3-F3 mounts: app.ts has no DOM test, so this reads its source and pins the joins. The tested modules (shell-strip, vault-wiring,
// authority) must be what app.ts really calls; a module nobody calls is the fault this file exists to catch.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = readFileSync(fileURLToPath(new URL("../src/app/app.ts", import.meta.url)), "utf8");
const count = (re: RegExp): number => (app.match(re) ?? []).length;

describe("app.ts mounts the tested modules", () => {
  it("every screen is drawn through withShellStrip, once, around renderApp (the pcoff strip on every screen)", () => {
    expect(count(/withShellStrip\(renderApp\(v\)/g)).toBe(1);
    expect(app).not.toMatch(/innerHTML\s*=\s*renderApp\(/);
    expect(app).toMatch(/from "\.\/shell-strip"/);
    expect(app).toContain("asOf: v.projection?.generatedAt ?? null");
    expect(app).toContain("pcoff: v.pcoff === true");
  });
  it("the vault is driven only through vault-wiring: one call per event, no inline hide/show/lock left", () => {
    expect(app).toMatch(/from "\.\/vault-wiring"/);
    expect(count(/createVaultWiring\(/g)).toBe(1);
    for (const inline of ["vault.hide(", "vault.show(", "vault.lock(", "wakeOrders"]) expect(app, inline).not.toContain(inline);
    expect(count(/vaultWiring\.visibility\(\{ hidden: document\.hidden, phase: lockState\.phase, now: Date\.now\(\) \}\)/g)).toBe(1);
    expect(count(/vaultWiring\.unlocked\(\)/g)).toBe(1);
    expect(count(/vaultWiring\.wipe\(\)/g)).toBe(1);
    expect(count(/vaultWiring\.locked\(\)/g)).toBe(1);
  });
  it("the vault wiring is given the orders key, and an emptied vault reloads only when the phone is not locked", () => {
    expect(app).toContain("key: ORDERS_VAULT_KEY");
    expect(app).toContain('if (emptied && lockState.phase !== "locked") void h.reload()');
  });
  it("the orders host gets the real command-authority expiry (the PC time), not a constant undefined", () => {
    expect(app).toContain("authorityExpiresAt: s.authorityExpiresAt");
    expect(app).not.toMatch(/authorityExpiresAt:\s*\(\)\s*=>/);
  });
});

// W3-F wave 3 phase B: the inbox is mounted by app.ts through createInboxMount (own file, own tests). These pin the joins.
const build = readFileSync(fileURLToPath(new URL("../build.mjs", import.meta.url)), "utf8");
describe("app.ts mounts the inbox", () => {
  it("one mount over the lazy screen, one host over the real stack: sealed conversations, the 'conversations' poll, the command authority", () => {
    expect(count(/createInboxMount\(/g)).toBe(1);
    expect(count(/createInboxHost\(/g)).toBe(1);
    expect(count(/import\("\.\.\/views\/inbox\/screen"\)/g)).toBe(1);
    expect(app).toContain("openConversations: s.openConversations");
    // Every direct poll goes through directPoll (a revoked answer wipes at once), so the inbox poll is no longer a bare relay.poll.
    expect(app).toContain('poll: async () => { await directPoll("conversations"); await s.refresh(); }');
    expect(app).not.toContain('await relay.poll("conversations")');
    expect(count(/authorityExpiresAt: s\.authorityExpiresAt/g)).toBe(2);
    expect(app).toContain("readConversations: p.read, reload: p.reload, subscribeAll: p.subscribe");
  });
  it("orders and inbox send through the SAME flush wrapper: an accepted command is flushed at once", () => {
    expect(count(/outbox: flushingOutbox\(s\)/g)).toBe(1);
    expect(count(/const outbox = flushingOutbox\(s\)/g)).toBe(1);
    expect(app).not.toContain("void s.outbox.flush()"); // the flush now lives in command-follow.ts, which also tells the screens
  });
  it("W196 the phone follows a tap: the flush wrapper, the status poll and the inbox all go through ONE command-follow emitter", () => {
    expect(app).toMatch(/from "\.\/command-follow"/);
    expect(count(/createCommandFollow\(/g)).toBe(1);
    expect(app).toContain("createCommandFollow({ commandSent: () => sync.commandSent() })");
    // (a) after an accepted tap: flush, tell the screens, arm the status poll
    expect(app).toContain("const flushingOutbox = (s: CommandStack) => follow.wrap(s.outbox);");
    // (b) every status poll tells the screens when a record changed
    expect(count(/follow\.polled\(s\.outbox, async \(\) => \{/g)).toBe(1);
    expect(app).toContain("await s.outbox.flush(); await s.outbox.refresh();");
    // (c) the inbox gets the real emitter, the orders host is told through its own notify; the no-op subscribe is gone
    expect(app).toContain("subscribeAll: follow.subscribe,");
    expect(app).toContain("follow.subscribe(() => ordersHost?.notify());");
    expect(app).not.toContain("subscribeAll: () => () => undefined");
    // nothing in app.ts arms the status poll by hand any more: command-follow does, once per accepted tap
    expect(count(/sync\.commandSent\(\)/g)).toBe(1);
  });
  it("go() attaches the inbox for inbox and conversation; a wipe forgets the mount; an unlock revisits it only when the phone is not locked", () => {
    // The screen mounter owns the draw now: go(), popstate and startup call attachFor(), which attaches the inbox host for the inbox group.
    expect(app).toContain('else if (group === "inbox") { const first = inboxMount === null; void attachInbox(id as "inbox" | "conversation")');
    expect(app).toContain("attachFor();");
    expect(app).toContain("stack = null; ordersHost = null; inboxMount = null;");
    expect(app).toMatch(/lockState\.phase !== "locked" && GROUP_OF\[view\.screen === "lock" \? returnTo : view\.screen\] === "inbox"\) void inboxMount\?\.visit\("inbox"\)/);
  });
  it("LAB (31 Oct 2026, real Chromium): the first visit to Chats goes through open() (sealed copy, then ONE poll when nothing is sealed), and a click is decided by clickTarget INSIDE the page root", () => {
    expect(app).toContain("await inboxMount.open(screen);");
    expect(app).not.toContain("await inboxMount.visit(screen);");
    expect(app).toContain('import { clickTarget } from "./click-target";');
    expect(app).toContain("const el = clickTarget(event.target, root);");
    expect(app).not.toContain('.closest<HTMLElement>("[data-act],[data-nav],[data-lang],[data-theme]")');
  });
  it("W198 the sync engine is told whenever the lock screen is entered or left by set(): unlock, lock setup x2, wake-up while locked", () => {
    expect(app).toContain('if (lockState.phase === "unlocked") { vaultWiring.unlocked(); set({ screen: returnTo, lockNotice: null }, true); sync.onScreen(); return; }');
    expect(app).toContain('startLockSetup: () => { returnTo = "settings"; set({ screen: "lock", lockMode: "set", lockNotice: null }); sync.onScreen(); },');
    expect(app).toContain('case "lock-set": returnTo = "settings"; set({ screen: "lock", lockMode: "set", lockNotice: null }); sync.onScreen(); break;');
    expect(app).toContain('else if (lockState.phase === "locked" && view.screen !== "lock") { returnTo = view.screen; set({ screen: "lock", lockMode: "enter", lockNotice: null }); sync.onScreen(); }');
    expect(app).toContain("else sync.onVisible();");
    expect(count(/sync\.onScreen\(\)/g)).toBe(5); // go() and the four above, nowhere else
    expect(count(/set\(\{ screen: returnTo/g)).toBe(1);
  });
  it("W198b the watch starts on EVERY screen: one watchRelay function (the pairing watch keeps its own startWatch), called by loadToday and by the startup (not for Today, not with a pairing link, not with a test source); sync.start(false) exactly once", () => {
    const fn = /async function watchRelay\(\): Promise<boolean> \{[\s\S]*?\n  \}\n/.exec(app)?.[0] ?? "";
    expect(count(/async function watchRelay\(/g)).toBe(1);
    expect(fn).toContain("const poll = await relay.poll().catch(() => null);");
    expect(fn).toContain("const reaction = poll ? await reactToPoll(poll, wipe) : null;");
    expect(fn).toContain('if (reaction?.kind === "revoked") { showRevoked(reaction); return true; }');
    expect(fn).toContain('if (poll && poll.kind !== "not_paired") sync.start(false);');
    // the lock screen is never repainted by the watch: pcoff is set only when it changes
    expect(fn).toContain('const pcoff = reaction?.kind === "pcoff"; if ((view.pcoff === true) !== pcoff) set({ pcoff });');
    expect(count(/sync\.start\(false\)/g)).toBe(1);
    expect(count(/relay\.poll\(\)/g)).toBe(2); // watchRelay and the pairing resume poll; loadToday no longer polls by hand
    expect(app).toContain("if (!options.source && (await watchRelay())) return;");
    expect(app).toContain('else if (view.screen === "today") void loadToday();\n  else if (link.kind === "none" && !options.source) void watchRelay();');
    expect(count(/watchRelay\(\)/g)).toBe(3); // the definition, loadToday, the startup
  });
  it("W198 a poll answer while locked draws nothing: onPoll only refreshes the sealed stack or wipes (no set, no go, no paint)", () => {
    const line = /onPoll: \(poll\) => \{[^\n]*\n/.exec(app)?.[0] ?? "";
    expect(line).toContain('if (poll.kind === "updated") void stack?.refresh().catch(() => undefined);');
    expect(line).toContain('if (poll.kind === "revoked") void reactToPoll(poll, wipe).then((r) => { if (r.kind === "revoked") showRevoked(r); });');
    for (const forbidden of ["set(", "go(", "paint(", "vault"]) expect(line, forbidden).not.toContain(forbidden);
  });
  it("the inbox rules ship in the css, after the orders rules (one line, like orders.css)", () => {
    const o = build.indexOf("src/styles/orders.css"); const i = build.indexOf("src/styles/inbox.css");
    expect(o).toBeGreaterThan(0); expect(i).toBeGreaterThan(o);
  });
});
